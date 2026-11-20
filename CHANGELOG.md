# Changelog

## [0.7.0](https://github.com/FatherApps/trailskill/compare/v0.6.0...v0.7.0) (2026-11-20)


### Features

* **accounts:** delete an account after a 30-day grace period, server code ([#1273](https://github.com/FatherApps/trailskill/issues/1273)) ([a8084b0](https://github.com/FatherApps/trailskill/commit/a8084b00f298484ab9dab0b2a14e1822edfa75cb)), closes [#1244](https://github.com/FatherApps/trailskill/issues/1244)


### Bug Fixes

* **ci:** skip bot-managed branches in flag-stale-prs ([#1277](https://github.com/FatherApps/trailskill/issues/1277)) ([501474e](https://github.com/FatherApps/trailskill/commit/501474e3e2505fa51277ad37b4c49b8e769dbabe)), closes [#1271](https://github.com/FatherApps/trailskill/issues/1271)
* **session:** hold writes only for the person whose sign-out is finishing ([#1284](https://github.com/FatherApps/trailskill/issues/1284)) ([90fc820](https://github.com/FatherApps/trailskill/commit/90fc8200114b91d2347a4851b7e7348346f37162)), closes [#1270](https://github.com/FatherApps/trailskill/issues/1270)
* **session:** never leave the app blank when the local database does not answer ([#1278](https://github.com/FatherApps/trailskill/issues/1278)) ([f917daa](https://github.com/FatherApps/trailskill/commit/f917daad35c8bfee1fb35551b81131b00b930293)), closes [#1270](https://github.com/FatherApps/trailskill/issues/1270)
* **sync:** apply the athlete photo PUT as an upsert by athlete_id ([#1274](https://github.com/FatherApps/trailskill/issues/1274)) ([43383e4](https://github.com/FatherApps/trailskill/commit/43383e477b342f9467daff5708775a2b000b4f9d)), closes [#1253](https://github.com/FatherApps/trailskill/issues/1253)
* **sync:** el admin o entrenador de dos escuelas no recibe el par dado de baja ([#1272](https://github.com/FatherApps/trailskill/issues/1272)) ([74bf617](https://github.com/FatherApps/trailskill/commit/74bf61701eba6eb3924196b61bc99bbc918b78d5))

## [0.6.0](https://github.com/FatherApps/trailskill/compare/v0.5.0...v0.6.0) (2026-11-20)


### Features

* **athletes:** photo card, waiting photos in the avatar and the withdrawal sheet ([#1257](https://github.com/FatherApps/trailskill/issues/1257)) ([afa2d20](https://github.com/FatherApps/trailskill/commit/afa2d2002f3a19232a735299882d8c985fd462a4))
* **family-timing:** show a camera badge on Mis tiempos rows with a video ([#1266](https://github.com/FatherApps/trailskill/issues/1266)) ([6e4eed6](https://github.com/FatherApps/trailskill/commit/6e4eed64e805a42a8211626624ae6bea0944f8a3)), closes [#1265](https://github.com/FatherApps/trailskill/issues/1265)

## [0.5.0](https://github.com/FatherApps/trailskill/compare/v0.4.0...v0.5.0) (2026-11-20)


### Features

* **accounts:** one ConsentCard per athlete with a checkbox per purpose and the legal text folded ([#1252](https://github.com/FatherApps/trailskill/issues/1252)) ([b4ed90f](https://github.com/FatherApps/trailskill/commit/b4ed90fe4f63130ff458b35ad2511e19a9f4e0f3)), closes [#1236](https://github.com/FatherApps/trailskill/issues/1236)
* **athletes:** athlete photos data model, private bucket, show_photo purpose and useAthletePhoto ([#1231](https://github.com/FatherApps/trailskill/issues/1231)) ([83715a3](https://github.com/FatherApps/trailskill/commit/83715a3b4416f14fd08ef0967dcfc7693ea4ee61)), closes [#1221](https://github.com/FatherApps/trailskill/issues/1221)
* **athletes:** end an athlete's link with a school (ended_at, ended_by) ([#1247](https://github.com/FatherApps/trailskill/issues/1247)) ([7a91b2f](https://github.com/FatherApps/trailskill/commit/7a91b2f5a16712833bdaccd2cc47862eee914254)), closes [#1243](https://github.com/FatherApps/trailskill/issues/1243)
* **athletes:** open the athlete history from the card in front, not only the Historial button ([#1262](https://github.com/FatherApps/trailskill/issues/1262)) ([659cca8](https://github.com/FatherApps/trailskill/commit/659cca86a4ae36411b59832f9ce538b4a69385bc)), closes [#1238](https://github.com/FatherApps/trailskill/issues/1238)
* **athletes:** show the athlete avatar where the name appears ([#1235](https://github.com/FatherApps/trailskill/issues/1235)) ([e4c8810](https://github.com/FatherApps/trailskill/commit/e4c881027d57875127805d128c5f53fd68cfb5b4)), closes [#1223](https://github.com/FatherApps/trailskill/issues/1223)
* **core-ui:** add AthleteAvatar with initials, optional photo and its tokens ([#1227](https://github.com/FatherApps/trailskill/issues/1227)) ([410cc9a](https://github.com/FatherApps/trailskill/commit/410cc9ae7be25274a1348ad0922d6d3a761fbecd))
* **family-timing:** compact Mis tiempos list with the swimmer card ([#1218](https://github.com/FatherApps/trailskill/issues/1218)) ([d973872](https://github.com/FatherApps/trailskill/commit/d973872b631f8f69f02ff5c3791a9dd9eac9763a))


### Bug Fixes

* **athletes:** delete photos without show_photo, serve only the current object, queue deleted paths ([#1234](https://github.com/FatherApps/trailskill/issues/1234)) ([80fec6b](https://github.com/FatherApps/trailskill/commit/80fec6b5c7ee4c9d5b37df1baf1cb1199d9d5bf1)), closes [#1232](https://github.com/FatherApps/trailskill/issues/1232)
* **ui:** one round back button on every screen ([#1261](https://github.com/FatherApps/trailskill/issues/1261)) ([6100eac](https://github.com/FatherApps/trailskill/commit/6100eac7f630ccd487b9ba1a45f072c1cbb16f5b)), closes [#1237](https://github.com/FatherApps/trailskill/issues/1237)

## [0.4.0](https://github.com/FatherApps/trailskill/compare/v0.3.1...v0.4.0) (2026-11-19)


### Features

* **family-timing:** share a time's video and link it on the receiving phone ([#1215](https://github.com/FatherApps/trailskill/issues/1215)) ([26bda56](https://github.com/FatherApps/trailskill/commit/26bda56da7b7afc5113dedc4c6330ca91fa17e09)), closes [#1201](https://github.com/FatherApps/trailskill/issues/1201)

## [0.3.1](https://github.com/FatherApps/trailskill/compare/v0.3.0...v0.3.1) (2026-11-19)


### Bug Fixes

* **release:** move the Expo owner to the organization and document recovery and the first run ([#1212](https://github.com/FatherApps/trailskill/issues/1212)) ([b1a31aa](https://github.com/FatherApps/trailskill/commit/b1a31aa03b36e26cdd40bb0490bdca71bd052b0a)), closes [#1209](https://github.com/FatherApps/trailskill/issues/1209)

## [0.3.0](https://github.com/FatherApps/trailskill/compare/v0.2.0...v0.3.0) (2026-11-19)


### Features

* **settings:** turn on No molestar while recording video ([#1200](https://github.com/FatherApps/trailskill/issues/1200)) ([f801f36](https://github.com/FatherApps/trailskill/commit/f801f36edb736efc3bfa7a4494b06a4000eef1ed)), closes [#1090](https://github.com/FatherApps/trailskill/issues/1090)

## [0.2.0](https://github.com/FatherApps/trailskill/compare/v0.1.0...v0.2.0) (2026-11-19)


### Features

* **family-timing:** play each time's video from Mis tiempos ([#1199](https://github.com/FatherApps/trailskill/issues/1199)) ([5813af9](https://github.com/FatherApps/trailskill/commit/5813af9d9eebe44ff731527aba0c90f42035150a)), closes [#1089](https://github.com/FatherApps/trailskill/issues/1089)
* **release:** add expo-updates with the fingerprint runtime and the qa channel ([#1191](https://github.com/FatherApps/trailskill/issues/1191)) ([f39ddd6](https://github.com/FatherApps/trailskill/commit/f39ddd608ade9f7572db1610c82ab6ef5be1b2ca)), closes [#1188](https://github.com/FatherApps/trailskill/issues/1188)
* **settings:** add the minimum app version gate ([#1193](https://github.com/FatherApps/trailskill/issues/1193)) ([8799e34](https://github.com/FatherApps/trailskill/commit/8799e3435e795f71b84d6562c37e14548c5d30b3)), closes [#1189](https://github.com/FatherApps/trailskill/issues/1189)


### Bug Fixes

* **accounts:** rewrite the three es-CO version 1 authorization texts with the approved bodies ([#1190](https://github.com/FatherApps/trailskill/issues/1190)) ([fa0fa3c](https://github.com/FatherApps/trailskill/commit/fa0fa3cd4cf0126d6cda734566500588721d908d)), closes [#1185](https://github.com/FatherApps/trailskill/issues/1185)
* **deploy:** test the per-delete manifest re-read and re-upload a missing own dump ([#1168](https://github.com/FatherApps/trailskill/issues/1168)) ([d46041b](https://github.com/FatherApps/trailskill/commit/d46041b0eb09cce2e22fbd9591d8638384391337)), closes [#1158](https://github.com/FatherApps/trailskill/issues/1158)
* **family-timing:** show an error and go back to the stopwatch when the camera fails to open ([#1177](https://github.com/FatherApps/trailskill/issues/1177)) ([2ef146d](https://github.com/FatherApps/trailskill/commit/2ef146d324d42a07ea42ef5de41b7f441c5baab4)), closes [#1171](https://github.com/FatherApps/trailskill/issues/1171)
* **family-timing:** warn the guardian when the recorded video could not be saved to the gallery ([#1180](https://github.com/FatherApps/trailskill/issues/1180)) ([750958e](https://github.com/FatherApps/trailskill/commit/750958e686a0cf9db7009e8f90b1b620d3eb12a0)), closes [#1172](https://github.com/FatherApps/trailskill/issues/1172)
* **navigation:** hide the back button on root screens with no history ([#1184](https://github.com/FatherApps/trailskill/issues/1184)) ([5026bfd](https://github.com/FatherApps/trailskill/commit/5026bfd1a8d33eb75517c2667e2ccc13a67c7ef3)), closes [#1175](https://github.com/FatherApps/trailskill/issues/1175)
* **release:** block SYSTEM_ALERT_WINDOW in the Android release manifest ([#1183](https://github.com/FatherApps/trailskill/issues/1183)) ([3ae96c1](https://github.com/FatherApps/trailskill/commit/3ae96c16be17b72faf848d3a8392fbc8c0306a73)), closes [#1182](https://github.com/FatherApps/trailskill/issues/1182)
* **release:** drop the unused media read permissions and name the gallery album Swimcro ([#1174](https://github.com/FatherApps/trailskill/issues/1174)) ([cb52b87](https://github.com/FatherApps/trailskill/commit/cb52b870a464742a9bc76a83ebd9bce45b0f3212)), closes [#1169](https://github.com/FatherApps/trailskill/issues/1169)
* **release:** match the real release-please branch name in the PR exemption ([#1208](https://github.com/FatherApps/trailskill/issues/1208)) ([6bad8d2](https://github.com/FatherApps/trailskill/commit/6bad8d2c31e3b7adb39a3fba9ee6ae67e7f3e65d)), closes [#1207](https://github.com/FatherApps/trailskill/issues/1207)
