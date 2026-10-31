# 調査メモ（2026-10-24 実施、すべて web index 経由。研究ブラウザは openstreetmap.org へ DNS 解決失敗のため live 確認できず）

## 鳩
- Pennycuick 1968 JEB 水平飛行 3-16 m/s, 最小出力 8-9 m/s
- Berg & Biewener 2010 JEB 213:1651 羽ばたき頻度 離陸8.88→7.68, 中間6.57, 着陸前7.78 Hz
- Dial & Biewener 1993 水平 6-9 m/s で 8.6 Hz（条件差あり）
- Davies & Green 1988 JEB head-bobbing, Frost 1978 hold 63%, thrust 0.61 m/s, トレッドミルで消失
- Nagy et al 2010 Nature 464:890-893 GPS最大10羽, 階層, 方向転換遅延, 左眼反応速い。追随遅延約0.3秒(NatGeo解説)
- Yomosa et al 2015 PLoS ONE 旋回 parallel-path と equal-radius 混合
- Chen et al 2016 EPL リーダー切替（急旋回時 一時リーダー）
- Sankey & Portugal 2019 solo 優先速度 重い個体15.5→14.1, 軽い+1.5, 群れ速度は妥協 (Goldilocks)
- Papadopoulou et al 2022 RSOS / PLoS Comput Biol 集合逃避: collective turn と split, 周縁個体の急旋回→split多
- Rose, Nagel & Haag-Wackernagel 2006 Basel GPS 80羽: 最大5.29km, 32%は0.3km以内, 7.5%のみ>2km, 3戦略, 繁殖個体のみ二峰性
- Kano et al 2024 PMC11392528: fovea 12.6 c/deg, 側方投影~75°, red field <0.5m 近距離採餌, 両眼重なり~20°, 盲域~40°後方, 眼球運動~5°
- Hodos frontal acuity: 峰 11.04, 最大12.8±1.1 c/deg @10cm, 35cmで50%, 100cmで<1
- CFF: 総説 PMC2977968 で ~100Hz, Dodt&Wirth 1954 で最大143Hz, 波長依存実験 PMC5679541 では 38-73Hz (条件依存と明記すべき)
- 色覚: Bowmaker et al 1997 Vision Res: 単錐体4クラス, ハト第4は409nm violet, 第5 UV受容体は見つからず。Kawamura 1999 Genetics: オプシン遺伝子5クラス。4色型+油滴が確立、5色型は仮説
- 低周波: Guinness 0.5Hz, Kreithen&Quine系 0.05Hz報告も。infrasound map は Hagstrum 仮説
- 嗅覚: Gagliardo 2013 JEB総説 / 2024 Curr Opin Neurobiol、Papi 嗅覚剥奪で未知場所から帰巣不能、既知域では視覚ランドマーク代替
- Cornell Lab Rock Pigeon: 一腹1-3卵, 年1-6腹, 抱卵18日, 巣内25-32日, 餌 種子・果実・まれに無脊椎+人為餌, 営巣 ledge/nook
- Portugal et al 2020 Biol Lett 人工負荷で序列変動・攻撃約2倍 (2580 vs 1321)
- Goodwin ethogram (Great Lakes Pigeon Rescue 転載): bow-coo, 吸飲 drinking (くちばし浸し連続吸引, 食後/ねぐら帰還前/給餌前), Zweers double suction
- 大阪府 dobato ページ: 群れ, 雨の当たらない棚状ねぐら/巣, 早春-初冬繁殖, 降着時はまず手すりで安全確認, 糞のある所=安全と判断

## 地図
- G空間 大阪市2022: https://www.geospatial.jp/ckan/dataset/plateau-27100-osaka-shi-2022 LOD1 225.3km2, LOD2 5.238km2, LOD3 0.009km2, 形式 CityGML2.0/3DTiles/MVT/GeoJSON/GeoTIFF, 仕様書3.3版, v3が最新, FBXなし→PLATEAU SDK変換推奨, 無償・商用可. GeoTIFF範囲 上34.7708 左135.343 右135.606 下34.579 → 日本橋(34.669,135.506)は範囲内 (LOD1確定)
- G空間 大阪市2020: LOD1市内全域225.3, LOD2は新大阪(1.19)+十三(0.72)=1.91km2のみ → 2020版では日本橋はLOD2なし. 2022で拡大したが内訳地名は公開テキストで未確認
- PLATEAU site-policy: PDL1.0, CC BY互換, ODC BY/ODbLも妨げない, 出典記載要
- Cesium ion Japan 3D Buildings: 200超CityGML統合, 2300万棟, textured+untextured, 単一3D Tiles, ionアカウントで追加
- Three.js事例 (PLATEAU Journal j018-2): glTFが最も軽い, 座標原点が遠い問題はBlenderで調整, メッシュ結合+頂点削減, LOD1/LOD2混在が有効
- OSM: ODbL (表示+継承), PLATEAU→OSMインポートで height=measuredHeight, building:levels=storeysAboveGround に変換される計画/実績あり. building:levels 既定 1層=3m (Simple 3D)
- GSI: 基盤地図情報は建築物外周線のみ(高さなし), DEMは建物除去済み地表面. 3次元電子国土基本図は2026-04-01開始, 第1弾に大阪府は含まれず(Built報道), 有償483円/2次メッシュ面
