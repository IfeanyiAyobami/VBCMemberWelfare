<?php
/**
 * Plugin Name: VBC Guest Care Bridge
 * Description: Sends the existing guest journey to the Member Care review queue. Disabled until configured.
 * Version: 0.6.0
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) { exit; }

function vbc_care_ready() {
    if (!defined('VBC_CARE_BRIDGE_ENABLED') || VBC_CARE_BRIDGE_ENABLED !== true) { return false; }
    foreach (array('VBC_CARE_INTAKE_URL','VBC_CARE_BRIDGE_SECRET','VBC_CARE_TURNSTILE_SITE_KEY','VBC_CARE_TURNSTILE_SECRET_KEY') as $name) {
        if (!defined($name) || !is_string(constant($name)) || constant($name) === '') { return false; }
    }
    $url = wp_parse_url(VBC_CARE_INTAKE_URL);
    return $url && isset($url['scheme'], $url['host'], $url['path']) && $url['scheme'] === 'https'
        && $url['path'] === '/api/intake/wordpress' && !isset($url['user']) && !isset($url['pass'])
        && !isset($url['query']) && !isset($url['fragment'])
        && preg_match('/\A[a-f0-9]{64,128}\z/i', VBC_CARE_BRIDGE_SECRET);
}
function vbc_care_response($body, $status = 200) {
    $response = new WP_REST_Response($body, $status);
    $response->header('Cache-Control', 'private, no-store, max-age=0');
    return $response;
}
function vbc_care_origin($value) {
    $url = wp_parse_url($value);
    if (!$url || !isset($url['scheme'], $url['host'])) { return ''; }
    $port = isset($url['port']) ? (int) $url['port'] : ($url['scheme'] === 'https' ? 443 : 80);
    return strtolower($url['scheme'] . '://' . $url['host']) . ':' . $port;
}
function vbc_care_permission($request) {
    if (!vbc_care_ready()) { return new WP_Error('vbc_not_ready', 'Guest intake is not enabled.', array('status'=>503)); }
    if (vbc_care_origin($request->get_header('origin')) !== vbc_care_origin(home_url())) {
        return new WP_Error('vbc_origin', 'Please submit from the church guest page.', array('status'=>403));
    }
    return true;
}
function vbc_care_receive($request) {
    if (strlen($request->get_body()) > 32768) { return vbc_care_response(array('success'=>false,'message'=>'Guest card too large.'),413); }
    if (stripos($request->get_header('content-type'), 'application/json') === false) { return vbc_care_response(array('success'=>false,'message'=>'Send JSON.'),400); }
    $data = $request->get_json_params();
    if (!is_array($data) || !$data) { return vbc_care_response(array('success'=>false,'message'=>'Invalid guest card.'),400); }
    $limits = array('surname'=>100,'other_names'=>120,'visit_date'=>10,'occupation'=>150,'gender'=>20,'age_range'=>30,'marital_status'=>20,'phone'=>50,'whatsapp'=>50,'email'=>254,'residential_address'=>600,'born_again'=>10,'home_visit'=>10,'discovery_source'=>80,'discovery_details'=>1000,'invited_by'=>400,'birthday'=>5,'anniversary'=>5);
    $choices = array('contact_consent','email_opt_in','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in');
    $allowed = array_merge(array_keys($limits), $choices, array('requestId','website','turnstile_token'));
    if (array_diff(array_keys($data), $allowed) || !isset($data['requestId']) || !is_string($data['requestId']) || !preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i',$data['requestId'])) {
        return vbc_care_response(array('success'=>false,'message'=>'Invalid guest card fields.'),400);
    }
    if (!isset($data['website']) || $data['website'] !== '') { return vbc_care_response(array('success'=>false,'message'=>'Please check the guest card.'),400); }
    $payload = array('requestId'=>$data['requestId']);
    foreach ($limits as $field=>$limit) {
        // The Next.js receiver repeats full type, date, enum and contact validation.
        if (!isset($data[$field]) || !is_string($data[$field]) || strlen($data[$field]) > $limit * 4) { return vbc_care_response(array('success'=>false,'message'=>'Check the guest card details.'),400); }
        $payload[$field] = trim($data[$field]);
    }
    foreach ($choices as $field) {
        if (!isset($data[$field]) || !is_bool($data[$field])) { return vbc_care_response(array('success'=>false,'message'=>'Check the permission choices.'),400); }
        $payload[$field] = $data[$field];
    }
    if ($payload['contact_consent'] !== true) { return vbc_care_response(array('success'=>false,'message'=>'Please agree to visit follow-up permission.'),400); }
    // Best-effort per-origin-server-IP throttle; no forwarded IP headers or raw IP storage.
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
    $rate_key = 'vbc_care_rate_' . substr(hash_hmac('sha256',$ip,wp_salt('nonce')),0,32);
    $rate = get_transient($rate_key);
    if (!is_array($rate)) { $rate = array('count'=>0,'until'=>time()+900); }
    $limit = defined('VBC_CARE_RATE_LIMIT') ? max(10,min(1000,(int)VBC_CARE_RATE_LIMIT)) : 120;
    if ($rate['count'] >= $limit) { return vbc_care_response(array('success'=>false,'message'=>'Please wait a little before trying again.'),429); }
    $rate['count']++;
    set_transient($rate_key,$rate,max(1,$rate['until']-time()));
    $token = isset($data['turnstile_token']) ? $data['turnstile_token'] : '';
    if (!is_string($token) || $token === '' || strlen($token)>2048) { return vbc_care_response(array('success'=>false,'message'=>'Complete the security check and try again.'),400); }
    $verification = wp_safe_remote_post('https://challenges.cloudflare.com/turnstile/v0/siteverify',array(
        'timeout'=>8,'redirection'=>0,'sslverify'=>true,
        'body'=>array('secret'=>VBC_CARE_TURNSTILE_SECRET_KEY,'response'=>$token)
    ));
    if (is_wp_error($verification)) { return vbc_care_response(array('success'=>false,'message'=>'The security check is unavailable. Please try again.'),503); }
    $verified = json_decode(wp_remote_retrieve_body($verification),true);
    $host = wp_parse_url(home_url(),PHP_URL_HOST);
    if (wp_remote_retrieve_response_code($verification)!==200 || !is_array($verified) || empty($verified['success'])
        || !isset($verified['hostname'],$verified['action']) || strtolower($verified['hostname'])!==strtolower($host) || $verified['action']!=='vbc_guest') {
        return vbc_care_response(array('success'=>false,'message'=>'Refresh the security check and try again.'),400);
    }
    $body = wp_json_encode($payload);
    $timestamp = (string) time();
    $signature = 'sha256=' . hash_hmac('sha256',$timestamp . '.' . $body,VBC_CARE_BRIDGE_SECRET);
    $result = wp_safe_remote_post(VBC_CARE_INTAKE_URL,array(
        'timeout'=>15,'redirection'=>0,'sslverify'=>true,'data_format'=>'body','body'=>$body,
        'headers'=>array('Content-Type'=>'application/json','X-VBC-Timestamp'=>$timestamp,'X-VBC-Signature'=>$signature)
    ));
    if (is_wp_error($result)) { return vbc_care_response(array('success'=>false,'message'=>'We could not confirm your saved guest card. Please retry.'),503); }
    $ack = json_decode(wp_remote_retrieve_body($result),true);
    $code = wp_remote_retrieve_response_code($result);
    if ($code===200 && is_array($ack) && isset($ack['success']) && $ack['success']===true) {
        return vbc_care_response(array('success'=>true));
    }
    // Do not expose database errors, keys, internal URLs or member existence.
    $status = in_array($code,array(400,409,413),true) ? $code : 503;
    return vbc_care_response(array('success'=>false,'message'=>$status===400?'Please check your guest card details.':'We could not confirm your saved guest card. Please retry.'),$status);
}
add_action('rest_api_init',function(){
    register_rest_route('vbc-care/v1','/config',array('methods'=>'GET','permission_callback'=>'__return_true','callback'=>function(){
        $ready = (bool) vbc_care_ready();
        return vbc_care_response(array('enabled'=>$ready,'endpoint'=>rest_url('vbc-care/v1/guests'),'siteKey'=>$ready?VBC_CARE_TURNSTILE_SITE_KEY:''));
    }));
    register_rest_route('vbc-care/v1','/guests',array('methods'=>'POST','permission_callback'=>'vbc_care_permission','callback'=>'vbc_care_receive'));
});
add_shortcode('vbc_guest_journey',function(){
    $file = __DIR__ . '/elementor-guest-form.html';
    if (!is_readable($file)) { return '<p>The guest card is temporarily unavailable. Please contact the church office.</p>'; }
    $html = file_get_contents($file);
    return str_replace("configurationURL: '/wp-json/vbc-care/v1/config'",'configurationURL: ' . wp_json_encode(rest_url('vbc-care/v1/config')),$html);
});
