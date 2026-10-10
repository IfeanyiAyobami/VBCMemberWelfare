<?php
/**
 * Plugin Name: VBC Member Care Requeue Helper
 * Description: Admin-only Member Care delivery retry for the existing First-Timer Gateway v1.1.3. Does not resend Sheets or email.
 * Version: 1.0.0
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) exit;

add_action('add_meta_boxes_vbc_visitor', function () {
    if (!current_user_can('manage_options')) return;
    add_meta_box('vbc-member-requeue', 'Member Care delivery', function ($post) {
        if (!class_exists('VBC_First_Timer_Integration') || !is_callable(['VBC_First_Timer_Integration', 'member_sync'])) {
            echo '<p>Activate the existing First-Timer Gateway v1.1.3 first.</p>';
            return;
        }
        echo '<p>Status: <strong>' . esc_html(get_post_meta($post->ID, '_vbc_member_status', true) ?: 'Pending') . '</strong></p>';
        echo '<p>Queues this saved visitor using the original submission ID. Sheets and email are untouched. For a synced visitor, this verifies the Member Care receipt through its duplicate protection.</p>';
        echo '<button type="button" class="button" onclick="document.getElementById(&quot;vbc-member-requeue-form&quot;).submit()">Queue Member Care delivery</button>';
        echo '<p class="description">Configure the API URL and token first. Refresh after WP-Cron runs; a queue entry is not yet a delivery confirmation.</p>';
    }, 'vbc_visitor', 'normal', 'high');
});

// Separate form outside the WordPress editor form, avoiding nested form markup.
add_action('admin_footer-post.php', function () {
    $screen = get_current_screen();
    $post_id = absint($_GET['post'] ?? 0);
    if (!$screen || $screen->post_type !== 'vbc_visitor' || !$post_id ||
        get_post_type($post_id) !== 'vbc_visitor' || !current_user_can('manage_options') ||
        !current_user_can('edit_post', $post_id)) return;
    echo '<form id="vbc-member-requeue-form" method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('vbc_member_requeue_' . $post_id);
    echo '<input type="hidden" name="action" value="vbc_member_requeue">';
    echo '<input type="hidden" name="post_id" value="' . esc_attr($post_id) . '"></form>';
});

add_action('admin_post_vbc_member_requeue', function () {
    $post_id = absint($_POST['post_id'] ?? 0);
    if (!$post_id || get_post_type($post_id) !== 'vbc_visitor' ||
        !current_user_can('manage_options') || !current_user_can('edit_post', $post_id)) wp_die('Forbidden');
    check_admin_referer('vbc_member_requeue_' . $post_id);
    if (!class_exists('VBC_First_Timer_Integration') || !is_callable(['VBC_First_Timer_Integration', 'member_sync'])) wp_die('First-Timer Gateway unavailable');
    $settings = VBC_First_Timer_Integration::settings();
    if (empty($settings['member_url']) || empty($settings['member_token'])) wp_die('Configure the Member Care API URL and token first');
    if (!wp_is_uuid((string) get_post_meta($post_id, '_vbc_submission_id', true))) wp_die('Missing original submission ID; inspect this record before retrying');
    // Schedule before changing the saved status, so a scheduling error is visible.
    wp_clear_scheduled_hook('vbc_ft_member_sync', [$post_id]);
    $scheduled = wp_schedule_single_event(time() + 10, 'vbc_ft_member_sync', [$post_id], true);
    if (is_wp_error($scheduled) || !$scheduled) wp_die('Could not queue Member Care delivery; try again');
    delete_post_meta($post_id, '_vbc_member_attempts');
    update_post_meta($post_id, '_vbc_member_status', 'Pending');
    wp_safe_redirect(admin_url('post.php?post=' . $post_id . '&action=edit&vbc_member_queued=1'));
    exit;
});
