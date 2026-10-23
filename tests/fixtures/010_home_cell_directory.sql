-- VBC Home Cell Office Migration 010: directory seed

-- Source: CORRECTED HOME CELL(1).docx (66 cells, 11 groups)

-- Confirmed area names: Agbowo-UI and Sango-Apete.

-- Idempotent inserts; existing cells are not overwritten.

-- No leadership accounts, phone numbers or permissions are created.

BEGIN;

INSERT INTO public.hco_areas (name) VALUES ('Alakia Zone') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Monatan Zone') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Agbowo-UI') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Total Garden/Mokola') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Ojoo Area') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Bodija/Agodi Zone') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Sango-Apete') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Ologuneru Zone') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Eleyele/Jericho Zone') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Elebu Zone') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_areas (name) VALUES ('Akobo/Bashorun Zone') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Alakia Homecell', 'From Agodi Gate, towards Adegbayi, drop at Foye bus stop after Alakia. First right, then another right. First house after the empty plot.' FROM public.hco_areas WHERE name = 'Alakia Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Iyana-Agbala/Kuelu', 'From Gate to Iyana-Agbala or Adegbayi, take Okada to Iyana-Afoni. Alight and call.' FROM public.hco_areas WHERE name = 'Alakia Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Sanyo/Boluwaji', 'From Challenge, drop at Sanyo Bus Stop , (where there’s a Petrol Station. Move straight to Iyana-Cele bus stop at…AFOWOWE HOUSE …57, Zone (4BR) , Agbamu road, Sanyo,is behind , Osioyemi block industry.' FROM public.hco_areas WHERE name = 'Alakia Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ogungbade', 'Address: From Oki or Kukumoda Junction, take Okada to Ile Titun. Ask of Akanmo Block Industries.' FROM public.hco_areas WHERE name = 'Alakia Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ogbere/Olorunsogo', 'From Yidi Agodi, bike to Corpers Lodge at Sogo Close.' FROM public.hco_areas WHERE name = 'Alakia Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Old Ife Road I Homecell', 'From Yidi Agodi, bike to Corpers Lodge at Sogo Close.' FROM public.hco_areas WHERE name = 'Alakia Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Old Ife Road II', 'From Gate to Old Ife Road, turn inside Yokele Peken Junction. Abioye’s House is third right, second house on the right.' FROM public.hco_areas WHERE name = 'Alakia Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ibadan Central Hospital Homecell', NULL FROM public.hco_areas WHERE name = 'Alakia Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Monatan', 'From Iworoad To Adexbus-Stop, Academy Hospital Junction. Second Turning by the right. The house opposite the transformer.' FROM public.hco_areas WHERE name = 'Monatan Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ayepe', NULL FROM public.hco_areas WHERE name = 'Monatan Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Olodo', NULL FROM public.hco_areas WHERE name = 'Monatan Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Agbowo 1', 'Besides SU Guest house (Behind Agbowo Complex), Agbowo, Ibadan' FROM public.hco_areas WHERE name = 'Agbowo-UI'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Orogun', 'From Orogun Junction, take a bike to Bunmi Mini Mart or From Orogun Junction drive towards ST. Matthias Anglican Church,turn to the right un-tarred road in front of ST. Matthias Anglican Church, move forward a little and turn to your left and after Shallom Baptist Church move forward a little to a T Junction then stop and ask of daddy ibeji''s house (No 35,Alhaji Lateef Alli Street, Orogun)' FROM public.hco_areas WHERE name = 'Agbowo-UI'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Polytechnic Ibadan', 'SSQ 49, Staff Quarters UI Road, The Polytechnic Ibadan North Campus.' FROM public.hco_areas WHERE name = 'Agbowo-UI'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'UI 1', NULL FROM public.hco_areas WHERE name = 'Agbowo-UI'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'UI 2', NULL FROM public.hco_areas WHERE name = 'Agbowo-UI'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Nalende', 'From Makeel, ask for St. Stephen Church, then put a call across to the provided phone number.' FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Oremeji-Mokola', '29, Oliyide street, Oremeji Mokola, Ibadan' FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Agala GRA', 'No. 12 Pebble Lane, Oke Agala Estate.' FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Agbadagbudu Homecell', 'From Adeoyo Hospital to “Corner Agbadagbudu”, stop at a story building in between God’s Glorious Hand pharmacy and Assalam filling station. The building has a Redeemed Church inside.' FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Yemetu', 'Awos House, Adjacent Olubadan Palace, Oke-Aremo Road, Off, Yemetu Aladorin' FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'UCH', 'The Olasemis'' residence, Flat A36, Circular Road, UCH.' FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Kube', 'Street beside Decastle Hotel currently being demolish, cross to the untarred road, straight down ask for Bukode-Dad Odeyale''s House' FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Mokola', NULL FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Mokola 3', NULL FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Oke-Itunu', NULL FROM public.hco_areas WHERE name = 'Total Garden/Mokola'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ajobo', 'From Ojoo to Arulogun road. Drive down to Crown Height College by your left; take the 3rd turning by the right side (that is Bibire Block Industry). Second to the last on that street/close by the right side. Located behind a C.A.C church.' FROM public.hco_areas WHERE name = 'Ojoo Area'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Gbanda', 'Arulogun Mid-week Centre.' FROM public.hco_areas WHERE name = 'Ojoo Area'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Salvation', 'Behind Crypto Sec. School, Aroro-Makinde, Off Arulogun road, Ojoo.' FROM public.hco_areas WHERE name = 'Ojoo Area'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Akingbile', 'Flat 2 besides Devine Heritage School, Akingbile, Moniya, Ibadan.' FROM public.hco_areas WHERE name = 'Ojoo Area'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Holiness Estate', NULL FROM public.hco_areas WHERE name = 'Ojoo Area'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Iyana Bodija', 'From Ojoo or Iwo Road express, stop at Iyana Bodija (Bodija market road junction at the express), drive towards Bodija Isopako, enter Adeyeye street (second road to the left from Iyana Bodija Express junction). The home cell location is at the first house on your right with a red gate.' FROM public.hco_areas WHERE name = 'Bodija/Agodi Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ashi', 'No5 Popoola lane off Fabunmi close, ashi Bodija.' FROM public.hco_areas WHERE name = 'Bodija/Agodi Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Old Bodija I', 'No 12, Prince Awogboro Street, off Osuntokun Avenue, Old Bodija, Ibadan.' FROM public.hco_areas WHERE name = 'Bodija/Agodi Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Old Bodija 2', 'No 33, Obasanmi Olakanpo str., via Beckley str., off Adeyi Avenue, Old Bodija' FROM public.hco_areas WHERE name = 'Bodija/Agodi Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'New Bodija 1', 'From Aare or Favos junction, connect with Ladoke Akintola street, then Ayandipo street and then at Mofolasade Bolarinwa Street, turn right behind the former Sun beam school, go on straight past Adorable school . At T junction turn left into the Estate. After the gate, turn right into Bamidele Johnson Street, then left and then right through another gate. Its 2nd house has a green gate on the right. New Bodija,Ibadan' FROM public.hco_areas WHERE name = 'Bodija/Agodi Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Agodi GRA', 'Onikoko G.R.A., Opp. Ikolaba Community Primary School, Gen. Oladayo Popoola''s residence.' FROM public.hco_areas WHERE name = 'Bodija/Agodi Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ijokodo', 'No. 47, Babatunde Oyerinde Street, Aba Apata, Ijokodo.' FROM public.hco_areas WHERE name = 'Sango-Apete'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Apete', 'Address: From Apete, bike to Arola junction, past GOFAMINT Church. 8th house on the right, blue roof.' FROM public.hco_areas WHERE name = 'Sango-Apete'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Sango', NULL FROM public.hco_areas WHERE name = 'Sango-Apete'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Awotan', 'Zone 1, junction Sheu, beside CAC Soludero, Adeosun Lifeforte Awotan-Apete' FROM public.hco_areas WHERE name = 'Sango-Apete'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ologuneru 1', 'From Eleyele, take a taxi to camp and drop at Iyana Arihan. Cross to the other side, follow the untarred, enter road 1 and locate no 13. No 13, road 1. Achiever estate. Railway crossing. Camp Area, Ido Ibadan' FROM public.hco_areas WHERE name = 'Ologuneru Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ologuneru 2', 'Description of home : Ologuneru Ekerin Junction take bike to Ile-Ode Idi-Mango , Green House' FROM public.hco_areas WHERE name = 'Ologuneru Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ologuneru 3', NULL FROM public.hco_areas WHERE name = 'Ologuneru Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Iletuntun', '8 BMW , Alpha Grace Estate, beside Gasland, Ile tuntun -Idi -Ishin road, Ibadan.' FROM public.hco_areas WHERE name = 'Ologuneru Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Larikan/Ologuneru 4', 'Around Lariken College, Olonde*' FROM public.hco_areas WHERE name = 'Ologuneru Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Ajibose', 'No 7, Jibose Street, Oladele Phase 2, Araromi, Gbekuda, Ibadan' FROM public.hco_areas WHERE name = 'Ologuneru Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Jericho', '12A, Adebayo Ayorinde, Jericho, Ibadan' FROM public.hco_areas WHERE name = 'Eleyele/Jericho Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Eleyele 1', 'No 19 Omotosho Street Eleyele, Ibadan' FROM public.hco_areas WHERE name = 'Eleyele/Jericho Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Eleyele 3', NULL FROM public.hco_areas WHERE name = 'Eleyele/Jericho Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Alalubosa -', '11B Main Avenue, Alalubosa, Ibadan.' FROM public.hco_areas WHERE name = 'Eleyele/Jericho Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Idishin Homecell', 'No 1, Ollunu Close, Off Idishin, Jericho, Ibadan' FROM public.hco_areas WHERE name = 'Eleyele/Jericho Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'SON Eleyele', 'School of Nursing Eleyele' FROM public.hco_areas WHERE name = 'Eleyele/Jericho Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Oluyole', 'No. 3, Dr. Akinola Maja Street, Unity Reservation Estate, Oluyole.' FROM public.hco_areas WHERE name = 'Elebu Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Podo', 'No 39 Road 4 Zone B Aba ibeji Arapaja Area, Odo Ona Kekere Ibadan' FROM public.hco_areas WHERE name = 'Elebu Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Felele', 'No 3 Michael Falode Street Felele Rab Felele Ibadan. Edit: 8, Bode Williams Street Scout Camp Challenge' FROM public.hco_areas WHERE name = 'Elebu Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Elebu', '…from Alao Akala Expressway, turn into the street beside New Covenant Church, follow till you get to a T-junction then turn left until you get to a red gate by your left. Enter into the close, the fifth house (which is the fourth duplex) is the venue of the homecell.' FROM public.hco_areas WHERE name = 'Elebu Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Akala Express Road', 'Blk 12 B Close, Fateru Estate Oke Ominira Akala Express Road Opposite Bovas Petrol Station Ibadan.' FROM public.hco_areas WHERE name = 'Elebu Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Akobo 1', 'From Gate, take a vehicle to Basorun, alight at Bode. Green house behind BCOS.' FROM public.hco_areas WHERE name = 'Akobo/Bashorun Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Isokan Elewuro', '9, Unity Estate, Isokan Akobo' FROM public.hco_areas WHERE name = 'Akobo/Bashorun Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Akobo 3 Homecell', 'No 4, Idi-isin Street, Yawiri Ojurin, Akobo' FROM public.hco_areas WHERE name = 'Akobo/Bashorun Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'General Gas/ Iyana Church', 'No. 7 Sunflower, Kolapo Ishola Estate, General Gas.' FROM public.hco_areas WHERE name = 'Akobo/Bashorun Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Carlton Gate', 'Address: No 1, Debo Oladejo, Road 3, Carlton Gate Estate, Akobo.' FROM public.hco_areas WHERE name = 'Akobo/Bashorun Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Basorun 1', 'From Oba Akinyele Grammar School Bashorun, ask for Olopo-eyan house , then ask for Wale Murphy''s house.' FROM public.hco_areas WHERE name = 'Akobo/Bashorun Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Basorun 2', 'No 14, Abiodun Street, Bode Wasimi , Basorun. Ibadan' FROM public.hco_areas WHERE name = 'Akobo/Bashorun Zone'
ON CONFLICT (area_id, name) DO NOTHING;

INSERT INTO public.hco_cells (area_id, name, address)
SELECT id, 'Akala-Akobo', 'L5/2 Cedar Street Oke'' badan Estate, opposite NIPCO cooking gas station, Alao-Akala way, Akobo.' FROM public.hco_areas WHERE name = 'Akobo/Bashorun Zone'
ON CONFLICT (area_id, name) DO NOTHING;

COMMIT;

-- Verification (run separately if desired):

SELECT a.name AS area, count(c.id) AS home_cells FROM public.hco_areas a LEFT JOIN public.hco_cells c ON c.area_id=a.id GROUP BY a.name ORDER BY a.name;
