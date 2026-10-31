# 鳩が自律行動する3Dシミュレーション（大阪・日本橋）基礎資料レポート

対象：大阪市浪速区・中央区の日本橋（にっぽんばし）一帯を舞台に、ドバト／カワラバト *Columba livia domestica* が自律行動する3Dアプリを作るための基礎資料。
調査日：2026-10-24。確認方法は原則 web index（`index`）による原典ページ確認。G空間情報センターの大阪市2022年度データセットは index 経由で全文を確認した。研究ブラウザ（live）では OpenStreetMap 公式サイトへ DNS 解決に失敗したため、OSM の同エリアの現況描画は `verified live` ではなく index 情報と推論で記し、その旨を明記する。

表記ルール：**【確立】**＝査読論文・公的機関で複数確認できる知見、**【条件付き】**＝実験条件で値が変わる知見、**【仮説・議論中】**＝有力だが未確定、**【設計案】**＝本レポートがアプリ用に提案するパラメータ（実測値ではない）。

---

## Summary（要約）

1. **鳩の飛行**：巡航は概ね **8–16 m/s（29–58 km/h）**、レース／帰巣の群れ飛行では平均 **約15 m/s（54 km/h）** が実測の中心。羽ばたき頻度は水平飛行で **約6.6–8.6 Hz**、離陸初動で **約8.9 Hz** まで上がる。群れは固定編隊（V字）ではなく **クラスター型フロック**で、方向転換の遅延から決まる**リーダー階層**、旋回時の **parallel-path と equal-radius の混合**、捕食時の **集団旋回（collective turn）と分裂（split）** が実測されている。これらは Boids＋階層ウェイトでそのまま実装できる。
2. **地上行動の核**は head-bobbing：実際は「前に出す（thrust）＋空間に固定する（hold）」で、hold が歩行時間の **約63%**、hold 約 **91 ms**／thrust 約 **120 ms**（条件で変動）。視覚が駆動しており、トレッドミルで視覚流が止まると消失する。鳩視点カメラは「常時滑らか」ではなく **hold 中だけ安定するステップ式安定化**にするのが生物学的に正しい。
3. **視覚**：盲域が後方 **約40°**、裏を返せば視野は **約320°**、両眼重なりは前方 **約20°**（文献により 20–30°）。中心窩（側方・遠距離・動体）と red field／area dorsalis（前方下方・近距離ついばみ）という**二重の注視系**を持ち、正面視力は **約10 cm で最大 約12.8 cycles/deg**、時間分解能（フリッカー融合）は条件依存で **約100 Hz、最大 143 Hz 報告**。色覚は **4色型＋油滴**が確立、短波長側は **約409 nm の violet 感受性**まで伸びる。
4. **帰巣**は単一感覚ではなく、太陽コンパス＋体内時計、地磁気コンパス、嗅覚マップ、視覚ランドマーク、低周波音（infrasound）仮説の**多重冗長系**。都市のドバトの日常行動圏はレース鳩とまったく違い、バーゼル GPS 研究では **32%以上の個体がねぐらから 0.3 km 以内**、最大でも 5.29 km。日本橋アプリでは「長距離帰巣」より「**数百 m の生活圏＋強い場所固着**」をデフォルトにすべきである。
5. **地図データの推奨は1つ：国土交通省 PLATEAU 大阪市（2022年度、v3）の LOD1 を主軸に、日本橋を含む 3次メッシュ分だけを glTF/GLB に切り出して Three.js で自己ホスト配信する方式**（詳細は §2.4）。日本橋（北緯34.669度、東経135.506度）は大阪市域内であり **LOD1（市内全域 225.3 km²）には確実に含まれる**。LOD2（5.238 km²）の範囲に日本橋が含まれるかは公開テキストからは断定できなかった（要・図郭マップ／実データ確認）。Cesium ion の Japan 3D Buildings は試作最速だが、軽量・単独配信・ライセンス表記の単純さでは上記方式が勝る。OSM は道路・地物・POI の補完用に最適で、建物高さの主ソースにはしない。

---

## Findings

## テーマ1：鳩の生態・行動・感覚

### 1-0 基本プロフィール【確立】

- 体長 **29–37 cm**、体重 **230–370 g**（群れ飛行研究の供試個体では約380–500 g の重い個体も使われている＝飼育レース鳩と都市ドバトで体重帯が違う点に注意）、翼開長 **62–72 cm**。〔BirdFact, Rock Dove：https://www.birdfact.com/birds/rock-dove 〕
- 原種カワラバトは崖・岩棚に営巣する鳥で、都市の建物のレッジ（張り出し）・ひさし・橋梁下がその代替環境になることが、都市適応の出発点。〔Cornell Lab of Ornithology, Rock Pigeon Life History：https://www.allaboutbirds.org/guide/Rock_Pigeon/lifehistory 〕
- 日本のドバトについて大阪府は「中近東・北アフリカ・南ヨーロッパのカワラバトが家禽化され野生化したもの。群れで行動し、雨の降り込まない棚状の所にねぐらや巣を作る。繁殖期は長く早春から初冬まで何度も子育て」と公表している。〔大阪府「ドバトでお困りの方へ」：https://www.pref.osaka.lg.jp/o120140/doubutu/yaseidoubutu/dobato.html 〕

### 1-1 飛行

#### 速度【確立／条件付き】

| 状況 | 実測値 | 出典 |
|---|---|---|
| 風洞・水平飛行可能な範囲 | **3–16 m/s**、最小出力速度 **8–9 m/s**、ベスト L/D 約5.9 | Pennycuick (1968) *J Exp Biol* 49:527「Power Requirements for Horizontal Flight in the Pigeon」：https://journals.biologists.com/jeb/article-abstract/49/3/527/21322/Power-Requirements-for-Horizontal-Flight-in-the?redirectedFrom=fulltext |
| 若いレース鳩 約90 km 訓練飛行の平均帰巣速度 | 群1 **15.0±2.0 m/s**、群2 **15.6±2.7 m/s**（訓練5–8週でピーク、その後は「好みの速度」で一定） | Scullion ら、Profiling Flight Performance of Young Racing Pigeons：https://www.researchgate.net/publication/323504874_Profiling_Flight_Performance_of_Young_Racing_Pigeons_Columba_Livia_in_Training |
| 群れ飛行での速度の妥協（Goldilocks 原則） | 重い個体（約500 g）は solo 優先速度から最大 **1.4 m/s 減速（15.5→14.1 m/s）**、軽い個体（約380 g）は最大 **1.5 m/s 加速**して群れ速度に合わせる。理論的仕事率最小は体重 **約430 g** 付近 | Sankey & Portugal (2019) *Animal Behaviour*：https://pure.royalholloway.ac.uk/ws/portalfiles/portal/34341259/Sankey_et_al._Animal_Behaviour_2019.pdf |
| 単独飛行の雌（別研究の引用値） | 平均 **71 km/h（約19.7 m/s）** で単独雄やつがい雌より速い、とする報告もある | Microorganisms 2023, 11:1766 内の引用：https://www.researchgate.net/publication/372212928_The_Impact_of_Physical_Effort_on_the_Gut_Microbiota_of_Long-Distance_Fliers?_share=1 |

- **最高速度について**：一般向けサイトが挙げる 77.6 mph（約125 km/h）・92.5 mph（約149 km/h）といった数字は査読論文の一次計測として本調査では確認できなかった。**【未検証】としてアプリのパラメータには使わないこと**。追い風・急降下を含まない水平巡航の上限は上記 16–20 m/s 帯で設計するのが安全である。
- 都市上空では羽ばたき頻度が下がり（対照地形比 約0.1 Hz 低下、平均 6.93 Hz）滑空寄りになる傾向が GPS＋加速度ロガーで示されている＝「都市＝低エネルギーだが高速な飛行」という報告がある。〔Changing Flight and Flocking Dynamics … over Heterogeneous Landscapes, PMC：https://pmc.ncbi.nlm.nih.gov/articles/PMC12326086/ 〕

#### 羽ばたき・離着陸【確立】

- 羽ばたき頻度（WBF）：離陸1拍目 **8.88±0.28 Hz** → 4拍目 7.68 Hz と逓減、中間飛行 **6.57±0.30 Hz**、着陸直前（−1拍）**7.78±0.25 Hz** に再上昇し最終拍で 6.81 Hz に低下。打ち下ろし掃引角は離陸初期が最大 **203±5°**。〔Berg & Biewener (2010) *J Exp Biol* 213:1651-1658「Wing and body kinematics of takeoff and landing flight in the pigeon」：https://journals.biologists.com/jeb/article/213/10/1651/9685/Wing-and-body-kinematics-of-takeoff-and-landing 〕
- 別手法（胸筋力実測）では水平飛行（6–9 m/s）で **8.6±0.3 Hz** とされ、研究間で 6.5–8.9 Hz の幅がある。**【条件付き】個体・速度・計測法で変わるため、アプリでは速度連動の連続関数にする**（§パラメータ集参照）。胸筋ピーク力は着陸 18.7 N、水平 19.7 N、離陸 24.9 N、垂直上昇 26.0 N の順に大きい。〔Dial & Biewener (1993) *J Exp Biol* 176:31-54：https://journals.biologists.com/jeb/article-abstract/176/1/31/12693/Pectoralis-Muscle-Force-and-Power-Output-During?redirectedFrom=fulltext 〕
- 離陸の視覚的特徴：初動で翼端が背側で交差するほど大きく打ち（「拍手様」の大きなストローク）、着陸では脚を下げ尾羽を広げ、最終拍前に WBF と掃引角がピークになるフレアを行う、と上記 Berg & Biewener の運動学から再現できる。
- 滑空：鳩は連続羽ばたきだけでなく間欠的に翼を広げた滑空・翼を畳むバウンディングを挟む。都市域で羽ばたき頻度が下がる報告（前項）は滑空比率上昇で説明されている。**【設計案】巡航中は flap 0.7–3秒 → glide 0.5–2秒のサイクルを混ぜると実物らしくなるが、比率自体は一次値ではない。**

#### 群れ（フロック）の形成・維持、旋回・編隊【確立】

- 鳩は V字編隊を作らない。近距離を保つ **クラスター（塊状）フロック**で飛ぶ。
- **階層的リーダーシップ**：最大10羽の群れに 16 g GPS を装着した実験で、ペア間の「方向転換の遅延時間」から明確な階層が検出された。上位個体ほど群れの前方に位置し、平均位置と階層順位が強く相関。追随の遅延は平均 **約0.3秒**（二次解説値）。また同種を **左眼で見ているとき反応が速い** という左右性も見つかった。〔Nagy, Ákos, Biro & Vicsek (2010) *Nature* 464:890-893, doi:10.1038/nature08891、PubMed：https://pubmed.ncbi.nlm.nih.gov/20376149/ 〕
- **リーダーは固定ではない**：平滑な軌跡では長期リーダーが率いるが、急旋回・ジグザグでは一時的なリーダーへ主導権が移る「切替型階層」が報告されている。〔Chen et al. (2016) *EPL* 114:60008：https://ui.adsabs.harvard.edu/abs/2016EL....11460008C/abstract 〕
- **旋回の2様式の混合**：GPS 軌跡解析では、旋回時に相対位置を保つ **parallel-path**（外側ほど速く飛ぶ）と、同一円をなぞる **equal-radius**（外側ほど遅れて後方へ下がる）が混合して使われ、**旋回半径が小さいほど equal-radius 的になる**。方向転換の時間順序は群れ内の前後（縦）位置と厳密に対応する。〔Yomosa, Mizuguchi, Vásárhelyi & Nagy (2015) *PLoS ONE* 10:e0140558：https://kops.uni-konstanz.de/entities/publication/d377631f-fb2d-4066-bb58-4ca29889d7ea 〕
- **速度の同調**：個体は自分の優先速度を捨てて群れ速度へ妥協する（前項 Goldilocks）。低速ほど全体がまとまりやすく、高速ほど似た方向の小集団に割れやすい、というモデル解析もある（固定近傍数への相互作用が鳩データに適合）。〔Dynamical Modeling of Collective Behavior from Pigeon Flight Data, PMC：https://pmc.ncbi.nlm.nih.gov/articles/PMC3315451/ 〕
- つまり実物のフロック維持は「Boids 3規則（分離・整列・結合）＋固定近傍（topological）相互作用＋階層ウェイト＋速度妥協」の合成で説明でき、**距離ベースのみの Boids では旋回時の崩れ方が再現できない**。

### 1-2 地上行動

#### 歩行と首振り（head-bobbing）【確立】

- 実態は「bob（上下動）」ではない。**hold 相**：頭が空間に対して止まり体だけが前進する。**thrust 相**：頭が素早く前方へ突き出され次の hold 位置へ移る。歩行中、頭が静止している時間は **約63%**、thrust の頭部速度は **約0.61 m/s**。〔Frost (1978)「The Optokinetic Basis of Head-Bobbing in the Pigeon」*J Exp Biol*：https://www.researchgate.net/publication/254996614_The_optokinetic_basis_of_head_bobbing_in_pigeon 〕
- 駆動源は脚ではなく**視覚（optokinetic）**：ベルト速度と歩行速度を一致させたトレッドミル上では head-bobbing が**消失**し、逆に体を他動的に前進させると歩いていなくても出る。〔同上、および Davies & Green (1988) *J Exp Biol* 138:71-86：https://journals.biologists.com/jeb/article-abstract/138/1/71/5562/Head-Bobbing-During-Walking-Running-and-Flying?redirectedFrom=fulltext 〕
- 機能は二重：hold 相で網膜像を安定させ物体の動きを検出し、thrust 相で相対運動（視差）を増幅して餌などの検出を助ける、と Davies & Green は提案した。
- 時間パラメータ【条件付き】：ある実験条件では hold 平均 **91 ms**／thrust 平均 **120 ms**、頭速 <240 mm/s を hold、>480 mm/s を thrust と判定。求愛・旋回時では hold 139–156 ms／thrust 96–132 ms とする計測もある。速度が **約810 mm/s** を超えると hold が短縮・消失し flexion 相に置き換わる（走行・飛行移行域）。〔Vision during head bobbing, ResearchGate：https://www.researchgate.net/publication/26318641_Vision_during_head_bobbing_are_pigeons_capable_of_shape_discrimination_during_the_thrust_phase ；Davies & Green 1988 前掲〕
- 着陸時に見える首振りは「見かけ」であり、実際の着陸軌跡で頭は滑らか、という指摘もある（Frost）。**離陸時には head-bobbing リズムは出ない**（Davies & Green：歩行・走行・止まり木への飛行では出るが、地上離陸では出ない）。

#### ついばみ・採餌【確立】

- 地面の **0.5 m 以内**の近距離対象は red field（後述）で見てついばむ。ついばみは「先端でつまむ（tip）→頭を持ち上げて振る／こする」などの生得的動作パターンの組合せで、パンや肉のような人為餌では非効率になることも観察されている。〔Goodwin のエソグラム、Great Lakes Pigeon Rescue 転載：https://greatlakespigeonrescue.org/ethogram-of-the-pigeon 〕
- 採餌は社会的に行われる：自分で餌を見つける **producer** と、他個体の発見に便乗・横取りする **scrounger** の役割分担（producer-scrounger 動態）が群れ採餌で知られる。〔都市鳩レビュー内での引用 Giraldeau & Lefebvre 1987、ResearchGate：https://www.researchgate.net/publication/316223278_Dietary_habits_of_urban_pigeons_Columba_livia_and_implications_of_excreta_pH_-_a_review 〕
- 餌の基本：**種子・穀物・果実が主、無脊椎動物はまれ**。都市では人が意図的・非意図的に残したパンくず等の人為餌も普通に食べる。〔Cornell Lab 前掲：https://www.allaboutbirds.org/guide/Rock_Pigeon/lifehistory 〕大阪府も「木の実・草の実・芽・葉など植物性」とする（前掲）。

#### 水飲み・水浴び・休息【確立】

- **吸飲（suction drinking）**：ハト科の特徴で、くちばしを水に浸したまま頭を上げずに連続して飲める。機構は舌と咽頭による **二重吸引（double-suction / vacuum pump）**モデルで説明される。飲水タイミングは通例「採餌の後、ねぐらへ帰る前、雛へ給餌する前」。水が採餌場にあれば途中でも飲む。〔Zweers「Drinking of the Pigeon」：https://static1.squarespace.com/static/54694fa6e4b0eaec4530f99d/t/5c4dbfe2cd836601cd102933/1548599268708/DRINKING+OF+THE+PIGEON+.pdf ；エソグラム前掲〕
- 水浴び：浅い水たまり・水場で体を浸し羽を濡らす行動が日常的に見られ、羽づくろい（preening）とセットで休息時間帯に現れる。**頻度・持続時間の一次計測値は本調査では特定できなかった【未検証】**ので、アプリでは演出扱いとする。
- 休息・ねぐら：日中の短期休息は建物のパラペット・窓レッジ・コーニス等の**高所の止まり場（loafing）**、夜間のねぐらは風雨を避けられる橋梁下・高架下・駐車場・屋根裏・鐘楼など**覆いのある communal roost（共同ねぐら）**を使う。〔都市鳩レビュー前掲〕大阪の文脈では高架（阪神高速・鉄道高架）、駅舎・商業ビルのひさし、看板裏がこれに相当する**【設計案としての当てはめ】**。
- 降着時の安全確認：大阪府は「ドバトはベランダ等に降りるとき、まず手すりに止まって安全を確かめる性質があり、手すりに止まれなければ降りない（広い場所へは直接降りる場合あり）」「**糞のあるところを安全と判断する**」と明記する。これは着陸ポイント選択アルゴリズムに直接使える公的観察である。〔大阪府前掲〕

### 1-3 一日のリズム、縄張り・行動圏、帰巣本能

#### 一日のリズム【確立／条件付き】

- 昼行性。ねぐらを早朝に出て採餌へ向かい、夕方に帰る往復が農場利用型では明瞭（都市→農場は早朝、帰りは午後遅く）。〔Sacchi et al. ミラノ研究：https://www.researchgate.net/publication/229430517_Effects_of_building_features_on_density_and_flock_distribution_of_feral_pigeons_Columba_livia_var_domestica_in_an_urban_environment 〕
- 採餌活動のピークは **午前遅く〜午後**（Murton et al. 1972 を引くセンサス設計）。同研究はこの時間帯に調査している。
- バーゼル GPS 研究では活動の時間パターンは**性・繁殖状態・季節で変わり、二峰性（朝・夕にピーク）が明瞭だったのは繁殖個体のみ**。雄は早朝、雌は午後遅くに活動的という性差も報告されている。〔Rose, Nagel & Haag-Wackernagel (2006) *Behav Ecol Sociobiol*、EBSCO：https://openurl.ebsco.com/contentitem/doi%3A10.1007%252Fs00265-006-0162-8?sid=ebsco:ocu:record&id=ebsco:doi:10.1007%2Fs00265-006-0162-8&bquery=DE%20%22BIRD%20flight%22&page=1&link_origin=&searchDescription=BIRD%20flight ；Daily feeding site use 論文紹介：https://www.researchgate.net/publication/237999083_Daily_feeding_site_use_of_urban_pigeons 〕
- したがって「全個体が朝夕二峰性」という単純化は誤り。**繁殖ペアのみ二峰性、非繁殖個体は日中の loafing（休息・羽づくろい・日光浴）を挟む緩やかな活動**として実装すべきである。

#### 行動圏・場所固着【確立】

- バーゼル市内、自由生活の都市ドバト **80羽に GPS**：採餌戦略は (1) ねぐら近くの街路・広場・公園、(2) 市周辺の農地、(3) 港の埠頭・鉄道線路、の3型。**最大移動距離 5.29 km、32%以上が 0.3 km 以内に留まり、2 km 超は 7.5% のみ**。雌はより遠く、豊かで予測可能な餌場を好んだ。他都市の旧研究では 0.3–0.5 km 〜 18–25 km と幅が大きく、手法依存とされる。〔Rose et al. 2006 前掲〕
- 縄張り性は弱い。巣のごく周辺と止まり場所については防衛・固着を示すが、採餌場は群れで共有する共有資源であり、排他的な縄張りを持たないのが基本。巣場所・餌場への**強い再訪性（同じ場所・同じ行動を好む）**は自治体資料でも指摘される。〔鎌倉市等の自治体資料、大阪府前掲と同旨〕
- **設計含意**：日本橋モデルでは行動圏半径のデフォルトを **300 m（中央値イメージ）／上限 1–2 km** とし、個体ごとに「近所型・広域型」の戦略タイプを持たせるのが実測に近い。

#### 帰巣本能（ホーミング）【確立＋仮説の混在】

仕組みは「地図（map：自分の位置を知る）＋コンパス（compass：方位を取る）」の2段階モデルで整理される。

- **太陽コンパス【確立】**：太陽位置を体内時計で補正して方位を維持する。時計をずらす（clock-shift）と晴天時の帰巣方位が予測通りにずれる古典的実験がある。
- **地磁気コンパス【行動証拠は確立、受容器は議論中】**：地磁気の伏角等を使うコンパス行動は繰り返し示されてきたが、受容器の所在は (a) 眼のクリプトクロムによるラジカルペア、(b) 内耳からの脳幹入力（Wu & Dickman の神経記録）、(c) 上くちばしの磁性物質による強度計測、で競合し、**くちばし説の細胞同定は後に再検討を受けている**。アプリ上は「方位ノイズが磁気嵐・高圧線等で増える程度の表現」に留め、特定機構を断定しないこと。〔Nature, Lab Animal「The internal compass of the pigeon」：https://www.nature.com/articles/laban.210?error=cookies_not_supported&code=4ecb410b-f9d0-44a2-bdf4-028a3af70353 〕
- **嗅覚マップ【確立（未知場所では必須級）】**：Papi ら以来、嗅覚を奪われた（anosmic）鳩は**未知の放鳩地から帰巣できなくなる**ことが GPS 追跡でも再確認されている。若鳥期に巣で「風向とともに運ばれる匂いのプロファイル」を学習し、放鳩地の匂いから変位方向を推定するという仮説が支持される。一方、**既知エリア内では視覚ランドマークが代替でき、嗅覚剥奪の影響が消える**。どの匂い物質かは未特定で、大気中揮発性炭化水素の比率勾配が候補。〔Gagliardo (2013) *J Exp Biol* 総説：https://arpi.unipi.it/bitstream/11568/208204/2/Gagliardo%202013.pdf ；Gagliardo & Bingman (2024) *Curr Opin Neurobiol* 86:102870：https://arpi.unipi.it/retrieve/61149bde-950d-42ed-90af-2a5954ea6c29/Gagliardo and Bingman 2024The avian olfactory system and hippocampus_ Complementary roles in the olfactory and visual guidance of homing pigeon navigation.pdf 〕
- **視覚ランドマーク【確立】**：既知域では道路・鉄道・河川・建物列などの視覚的手がかりを辿る。霧で近傍ランドマークを隠しても遠方の既知ランドマーク（山頂）が見えれば帰巣できたという 2026 年の実験報告もあり、短距離では遠方ランドマーク＞地磁気という結果だった。〔Distant Landmarks Used for Navigation by Homing Pigeons, MDPI：https://www.mdpi.com/2075-1729/16/6/933 〕
- **低周波音マップ【仮説】**：鳩は infrasound を聞き取り（次節）、地形が放射する低周波を地図に使うという Hagstrum 仮説がある。魅力的だが**実証段階は嗅覚説より弱い**と位置づける。
- 距離のスケール：レースでは **数百 km**（単日 600–700 mile ≒ 960–1120 km という一般向け記述もあるが一次値としては扱わない）。実験研究では 15 km、95–246 km といった放鳩距離が普通に使われ、嗅覚研究は 100 km 超でも行われている。**【確立】少なくとも数十〜数百 km の帰巣能力は実験で裏づけがある**。ただしこれは訓練されたレース／伝書鳩の話で、都市ドバトの日常移動（§行動圏、最大数 km）とは別物として区別すること。

### 1-4 社会行動・コミュニケーション・繁殖

#### 序列【確立】

- 群れ内には直線的で急勾配な**優劣階層（pecking order）**があり、餌・水へのアクセス順位を決める。攻撃行動の内訳は pecking、chasing、beak grab、neck pull、wing slap 等。〔Portugal et al. (2020) *Biol Lett* 16:20200468：https://royalsocietypublishing.org/rsbl/article/16/8/20200468/34727/Artificial-mass-loading-disrupts-stable-social 〕
- 体重が序列を駆動する一因：最小個体に人工的負荷を付けると攻撃性が上がり序列最上位へ移り、外すと元に戻った。負荷セッションの攻撃総数は 2,580 回で、無負荷の最大セッション 1,321 回のほぼ2倍。**GPS ロガー装着自体が行動研究を歪めうる**という方法論的警告でもある。〔同上；Phys.org 解説：https://phys.org/news/2020-08-pigeon-driven-weight.pdf 〕
- 地上序列と飛行リーダー階層は関連するが同一ではない。飛行ではナビゲーション能力が高い個体がリーダーになりやすく（Nagy 2010）、情報が不正確なリーダーは影響力を失うという研究もある。**【設計案】個体パラメータは `dominance_ground` と `leadership_flight` を分ける。**

#### 求愛【確立】

- **bow-coo（お辞儀鳴き）**が求愛の中核：雄は体を立て、そ嚢（crop）を膨らませ、鳴きながら頭・首を鋭く下げ、尾羽を扇状に広げて雌の周囲を旋回しながら strut する。鳴きは “coo, roo-c’too-coo”（Goodwin 1983 記載）。相手の性の判定を兼ねており、雄同士なら攻撃に転じる。〔エソグラム前掲：https://greatlakespigeonrescue.org/ethogram-of-the-pigeon 〕
- その他：perch-coo（目立つ止まり場からの広告鳴き）、nest-coo（巣／候補地で雌雄が鳴く）、billing（くちばしを握らせて吐き戻し給餌する求愛給餌）、相互羽づくろい、雌の wing-flipping（巣への勧誘）などが一連のペア形成行動として記載される。
- 鳴き声【確立】：基本は低く柔らかい **coo** の反復で、文脈により bow-coo／perch-coo／nest-coo に分かれる。警戒時は短い grunt／呻り音。翼音（離陸時の羽ばたき音・羽笛様の音）も近接コミュニケーションとして機能しうるが、本調査では一次値を特定していない【条件付き扱い】。

#### 繁殖・子育て【確立】

| 項目 | 値 | 出典 |
|---|---|---|
| 一腹卵数 | **1–3卵（通常2）**、白い卵 | Cornell Lab 前掲 |
| 年間腹数 | **1–6腹**（条件が良ければ周年繁殖） | Cornell Lab 前掲 |
| 抱卵期間 | **18日**（文献幅 17–19日）。雌雄交代、通例として雄が日中・雌が夜間〜早朝を担う分担が知られる | Cornell Lab 前掲 |
| 巣内期間 | **25–32日**（寒期は長くなる） | Cornell Lab 前掲 |
| 巣 | 雄が巣材を1本ずつ運び、雌が巣の上で組み立てる。小枝・茎の粗末な台状巣。**再利用し、雛の糞を除去しない**ため次第に堅い鉢状に成長する | Cornell Lab 前掲 |
| 営巣場所 | 雄が選ぶことが多く、崖または人工構造物の **nook / cranny / ledge（隅・隙間・レッジ）**、ひさしの下・軒・階段室・廃屋・雨樋など | Cornell Lab 前掲 |
| 給餌 | 雌雄ともにそ嚢から分泌する **ピジョンミルク（crop milk）** を吐き戻して与える。数日後から柔らかくした種子へ移行 | エソグラム／Cornell 系資料 |
| 性成熟・寿命 | 性成熟は約7か月とする資料、飼育下寿命 15–20年の実験動物資料がある一方、都市の野外個体ははるかに短い。**値は出自で大きく違うため【条件付き】** | レビュー類（本文では断定しない） |

### 1-5 視覚・感覚 ― 鳩視点カメラの基礎

#### 視野【確立、数値に文献幅あり】

- 側方眼。**両眼重なり（binocular overlap）は前方 約20°**、**後方の盲域は約40°**。したがって水平視野の総和は **約320°** と計算できる。〔Kano et al. 系の総説的記述を含む精密追跡研究 (2024) PMC：https://pmc.ncbi.nlm.nih.gov/articles/PMC11392528/ 〕
- 別の古典的整理では「総視野 約300°、重なり 24–30°」とも言われる。**測定法（網膜投影か行動測定か）と頭部姿勢で 300–340° の幅が出る**ため、アプリでは **総視野 310±10°／両眼 20–25°／後盲域 35–40°** を採用値とし、単一の「正解値」にしないこと。
- 眼球運動の可動域は小さく **約5°** 程度しかない。そのため注視方向 ≒ 頭の向きであり、**頭部トラッキング＝視線トラッキング**として扱える（Kano らの研究デザインの前提）。これが head-bobbing が視覚安定化を担う理由でもある。

#### 二つの注視系：中心窩と red field【確立】

- **中心窩（fovea centralis）**：各眼に1つ、視野の側方 **約75°方向・地平付近**へ投影。視力 **12.6 cycles/deg**。主に **0.5 m より遠方**の対象・同種個体・遠方の動体（捕食者）を見る。側方単眼視の動体検出感度は前方両眼視の **約3倍**。〔Kano et al. PMC 前掲；Martinoya, Rivaud & Bloch (1983) *Behav Brain Res* 8:375-385〕
- **red field / area dorsalis**：くちばし下の前方両眼視野へ投影する第2の高密度域。近距離の採餌・ついばみ専用。前方軸の視力は **10 cm で最大（平均ピーク 11.04、個体最大平均 12.8±1.1 cycles/deg）**、35 cm で最大の50%、100 cm で 1 cycle/deg 未満へ急落する。つまり鳩は**前方では近視的、側方では遠視的**に最適化されている。〔Hodos et al.「Limits of visual acuity in the frontal field of the rock pigeon」JoVE Visualize：https://visualize.jove.com/16178153-limits-of-visual-acuity-in-the-frontal-field-of-the-rock-pigeon-columba-livia ；Bloch et al. の前方／側方比較〕
- **鳩視点カメラへの含意**：単一の均一解像度カメラは誤り。(a) 側方に高解像・遠方合焦の帯、(b) 前方下方に近距離（約10 cm 最良）だけ高解像の窓、(c) それ以外は低解像、という**不均一解像度レンダリング**が実物に近い。被写界深度も前方と側方で変える。

#### 色覚【確立：4色型／議論中：5色型】

- 網膜には単錐体が複数クラスあり、視物質の λmax は長波長側 約567 nm、中波長 約515 nm、短波長 約460 nm、そして **約409 nm（violet）** のクラスが確認されている。各錐体には油滴（oil droplet）がカットオフ・フィルタとして働き、実効分光感度を鋭くする。〔Bowmaker (1977) *Vision Res* および Bowmaker et al. (1997) *Vision Res* 37、PubMed 総括：https://pubmed.ncbi.nlm.nih.gov/9578901/ 〕
- 遺伝子レベルではオプシン遺伝子が **5クラス**単離されている（rh1, rh2, sws1 の2型, sws2 の2型相当, lws を含む報告）。ただし Bowmaker らの分光測定では「第5の真の UV 受容体は見つからなかった」とされ、ハトの短波長端は **UV というより violet（約400 nm 前後）**にピークを持つとするのが慎重な表現である。行動実験では近紫外域の弁別が示されており、感度域は概ね **約320–400 nm 側まで及ぶとする総説もあるが、受容体同定との整合は未完【議論中】**。〔Kawamura, Blow & Yokoyama (1999) *Genetics* 153:1839-1850：https://www.academia.edu/105773920/Genetic_Analyses_of_Visual_Pigments_of_the_Pigeon_Columba_livia_ ；Vorobyev et al. の油滴総説：https://docslib.org/download/3733695/tetrachromacy-oil-droplets-and-bird-plumage-colours 〕
- **実装**：人間の RGB に第4チャンネル（violet/近UV、中心 約405 nm）を足した **4原色レンダリング**が妥当。「5原色（pentachromatic）」を売りにするのは学術的には早計なので避ける。首の構造色（緑〜紫のイリデッセンス）は UV/violet 帯で見え方が変わるため、求愛シーンのマテリアルは分光寄りにすると差が出る【設計案】。

#### 時間分解能【条件付き】

- フリッカー融合頻度（CFF）は輝度・波長・網膜部位で大きく動く。総説値は「鳩で **最大約100 Hz**（人は約60 Hz）」。〔Shimizu et al. 系総説、PMC：https://pmc.ncbi.nlm.nih.gov/articles/PMC2977968/ 〕
- 古典的 ERG（Dodt & Wirth 1954）では **最大 143 Hz** まで報告され、近年の捕食者検出研究はこの値を根拠に 144 Hz ディスプレイを選んでいる。〔PMC 前掲 (11392528) の査読応答部〕
- 一方、LED を使った行動測定では波長ごとに **38 Hz（810 nm）〜73 Hz（565 nm）** と低めの値も出る。〔Symmetry recognition / CFF 研究、PMC：https://pmc.ncbi.nlm.nih.gov/articles/PMC5679541/ 〕
- **結論**：単一値を「鳩の CFF」としないこと。アプリ／鳩視点映像のフレームレートは **120–144 fps を目標**とし、「60 fps は鳩にはコマ落とし／ストロボとして見えうる」という演出上の注意を添えるのが正確である。

#### 聴覚・低周波【確立：感度／仮説：地図利用】

- 鳩は infrasound に極めて敏感。心拍反応による測定で **0.5 Hz まで**聴取可能とされ、Guinness もこれを「最も低い周波数を聞く動物」として記録する。より初期の Cornell 系実験では **0.05 Hz** までという報告が専門家インタビューで言及される。〔Guinness World Records：https://www.guinnessworldrecords.com/world-records/495696-lowest-frequency-hearing-%E2%80%93-animal ；Hagstrum インタビュー：https://portal.sonicacts.com/research/interview-with-jon-hagstrum-on-migrating-birds////blog 〕
- 可聴域の最感度帯は鳥類一般に **1–4 kHz** 付近で、鳩も例外ではないとされる。coo 自体は低く短い反復音である。
- 遠方嵐・地震・火山・地形由来の infrasound をナビゲーション地図に使う説は Hagstrum 仮説として提示するに留める。

#### 地磁気・嗅覚（感覚として）

- 地磁気：§1-3 の通り。感覚パラメータとしてアプリで使えるのは「伏角・強度勾配を弱い方位手がかりとして使う」「太陽が見えない曇天で比重が上がる」という**重み付けルール**までで、受容器の物理機構は未確定である。
- 嗅覚：鳩の嗅覚系は発達しており、嗅球・梨状皮質が帰巣に関与する神経証拠がある（Gagliardo & Bingman 2024 前掲）。都市アプリでは「餌場の匂い」よりも、**若鳥期に学習した巣周辺の風向×匂いの連合が、数百 m 圏の帰巣の初期方位付けに効く**という形で簡略化できる【設計案】。

### 1-6 都市環境での行動

- **集まる場所の3要素**：(1) 餌（広場・駅前・商店街の食べこぼし、餌やりスポット、穀物・残飯の出る場所）、(2) 水（飲水・水浴びできる浅い水場、噴水、雨後の水たまり）、(3) 止まり／営巣構造（レッジ、ひさし、看板、高架下、橋梁、ビルの隅）。ミラノ研究では**古い建物が多い区画で密度が高い**など建物特性が群れ分布を説明した。〔Sacchi et al. 前掲〕
- **人への馴れ**：都市ドバトは人との距離（逃避開始距離）が短く、人の餌付けに強く条件づけられる。producer/scrounger 動態により「人が餌を出す場所・時間」へ群れが集まる学習が起こる。大阪府も餌やりが個体数増加とトラブルの一因になるとして「エサをあげないで」と呼びかける（＝それだけ人為餌への依存と集合が強いことの裏返し）。〔大阪府前掲〕
- **糞シグナル**：糞のある場所を安全と判断して集まる（大阪府）。アプリでは `dropping_density` を着陸アトラクタとして使うと、実物らしい「いつもの場所」への集中が再現できる【設計案、根拠は自治体観察】。
- **天敵・危険回避**：
  - 主な空中捕食者はハヤブサ類。ロボット・ハヤブサ（RobotFalcon）で襲われた群れでは **集団旋回と分裂（split）** が増え、捕食者がいないとき小群はほとんど分裂しない。実測では 27 フライトで集団旋回 155 回、分裂 65 件（単独離脱 35、亜群分裂 30）。分裂か集団旋回かは、逃避を開始した個体（initiator）の**角速度と群れ内位置**で決まり、**周縁個体の急旋回は分裂を起こしやすい**。〔Papadopoulou et al. (2022) *R Soc Open Sci* 9:211898、データセット：https://datadryad.org/dataset/doi:10.5061/dryad.905qfttkc 〕
  - 集合逃避の計算モデル（HoPE）では、鳩は捕食者の**位置より進行方向（heading）から逃げる**ようにモデル化され、距離に依存しない単純な逃避規則から「近いほど頻繁に逃げる」パターンが自己組織化で創発した。〔Papadopoulou et al. (2022) *PLoS Comput Biol* 18:e1009772：https://cronfa.swansea.ac.uk/Record/cronfa59585/Download/59585__23732__e898d830d06a462b88ce3b0004087663.pdf 〕
  - 「利己的群れ（中心へ逃げ込む）」ではなく、群れ全体が同じ方向へ整列して逃げる協調的反応を示したという報告もある（Royal Holloway、RoboFalcon 実験）。〔Phys.org 報道：https://phys.org/news/2021-06-pigeons-selflessly-threat.html 〕
  - 地上ではカラス、ネコ、人の急接近、車両が逃避トリガーになる。逃避はまず**静止・注視（側方中心窩で見る）→ 数歩の歩行回避 → 短距離フライトで近くのレッジへ**、という段階反応にするのが観察に合う【設計案】。
- **集団採餌時の見張り**：頭部の向きから警戒／採餌の判別ができること（中心窩＝遠方警戒、red field＝近傍採餌）を前提に、群れ採餌中の個体ごとの視野利用が精密追跡されている。群れ全体では「誰かが見ている」確率が上がる many-eyes 効果を、個体の警戒時間割合の低下として実装できる。〔Kano et al. PMC 前掲〕

---

## テーマ2：大阪・日本橋の3Dマップデータ

対象エリアの確定：日本橋は中央区（1–2丁目）と浪速区（3–5丁目）に跨り、代表座標は **北緯34.669028度、東経135.5061694度**、堺筋沿いに南北 **約1.6 km** の細長い町。日本橋駅は 34.6670, 135.5040、難波駅（南海）は 34.663411, 135.501911。ミッション指定の目安 34.66N 135.50E はこの南西側（なんば寄り）を指す。〔日本橋（大阪市）：https://ja.wikipedia.org/wiki/大阪日本橋 〕

### 2-1 PLATEAU 大阪市3D都市モデル

#### 日本橋が含まれるか【確立：LOD1／未確定：LOD2】

- 最新のまとまった大阪市版は **2022年度版（製品仕様書 第3.3版、データのバージョンは v3 が最新）**。提供エリアは **LOD1作成範囲 225.3 km²、LOD2作成範囲 5.238 km²、LOD3作成範囲 0.009 km²**。大阪市の面積そのものが約225 km²であり、LOD1 は**市内全域**である。付随するオルソ写真（GeoTIFF）の範囲は 上34.770833／下34.579167／左135.34375／右135.60625 で、日本橋（34.669, 135.506）はその内側に完全に入る。**よって日本橋の建物は LOD1 では確実に収録されている**。〔G空間情報センター「3D都市モデル（Project PLATEAU）大阪市（2022年度）」：https://www.geospatial.jp/ckan/dataset/plateau-27100-osaka-shi-2022 （index で全文確認）〕
- **LOD2 について**：2020年度版では LOD2 は「新大阪駅周辺（1.19 km²）と十三駅周辺（0.72 km²）の合計 1.91 km²」のみで、**日本橋は LOD2 対象外だった**。〔同 2020年度版：https://www.geospatial.jp/ckan/dataset/plateau-27100-osaka-shi-2020 〕2022年度版で LOD2 は 5.238 km² へ拡大したが、拡大範囲の地名・図郭は本調査で開いた公開テキストには列挙されておらず、**日本橋・なんばが LOD2 に入ったかどうかは断定できない【未検証】**。確定方法は §2.5 に示す（図郭マップ PDF の目視、または CityGML を落として対象メッシュ内に `lod2Solid` を持つ建物があるかのスクリプト確認）。
- LOD3 は 0.009 km²（9,000 m²）しかなく、特定の実証対象に限られるため日本橋一帯の面としての利用は期待できない。

#### LOD の意味（建物）

- **LOD0**：屋根・フットプリントの平面形状。**LOD1**：フットプリントを計測高さまで押し出した箱型（直方体）モデル。**LOD2**：屋根形状を持ち、壁・屋根・床などが面種別に分かれ、テクスチャを貼れるモデル。**LOD3**：開口部や外装の細部まで持つモデル。〔PLATEAU How To Use TOPIC 3：https://www.mlit.go.jp/plateau/learning/tpc03-3/ 〕
- 日本橋の再現度への含意：LOD1 では「でんでんタウンの低層小規模店舗の連なり＋堺筋沿いの中高層ビル＋なんば高層群」という**スカイラインと建物間隔（鳩の飛行・着陸判定に必要な体積）は正しく再現できる**が、ひさし・看板・レッジの形状は無い。鳩の止まり場所は LOD1 の屋上面＋人工的に付加するレッジ帯で代替するのが現実的である【設計案】。テクスチャ付き LOD2 がもし対象外なら、見た目の「日本橋らしさ」は航空写真オルソ（GeoTIFF、地表）＋建物への疑似ファサード生成で補う必要がある。

#### データ形式・入手方法・ライセンス【確立】

- 形式：**CityGML 2.0 が基本形**。大阪市2022年度版ではほかに **3D Tiles、MVT、GeoJSON、GeoTIFF** が同梱／提供される。建築物モデルは **第3次地域区画（3次メッシュ、一辺約1 km）**単位でファイル分割されるため、日本橋（南北1.6 km）は複数メッシュに跨る。〔G空間 大阪市2022 前掲〕
- 最新版（v3）では **FBX は提供されず**、必要な形式への変換には **PLATEAU SDK の利用が推奨**されている。OBJ/FBX が同梱されていたのは2020年度版側である。〔同上〕
- 入手：G空間情報センターの各都市データセットページから**無償ダウンロード（商用利用可）**。PLATEAU 公式のオープンデータ一覧からも辿れる。〔PLATEAU Open Data：https://www.mlit.go.jp/plateau/open-data/ ；How To Use TOPIC 3「3D都市モデルのダウンロード」：https://www.mlit.go.jp/plateau/learning/tpc03-1/ 〕
- ライセンス：PLATEAU サイトポリシーにより、コンテンツは **公共データ利用規約（PDL1.0）**に基づき利用でき、同規約は **CC BY 4.0 と互換**で、利用者が **ODC BY / ODbL で利用することも妨げない**。出典記載が条件で、加工した場合は加工した旨の記載が必要。著作権は3D都市モデルについては各地方公共団体に帰属する。〔PLATEAU Site Policy：https://www.mlit.go.jp/plateau/site-policy/ ；FAQ：https://www.mlit.go.jp/plateau/faq/ 〕アプリ内クレジットに「国土交通省 Project PLATEAU／大阪市 3D都市モデルを加工して作成」等の一文を入れれば足りる、**継承（SA）義務はない**のが OSM との大きな違いである。

#### Webアプリへの取り込み

- **CesiumJS 経由（最速試作）**：Cesium ion の **Japan 3D Buildings** は PLATEAU の 200 超の CityGML データセットを統合した単一の 3D Tileset で、**2,300万棟**、テクスチャ付き／なし混在、メタデータ付き。Cesium ion アカウントで Asset Depot から追加すれば即座にストリーミング表示できる。CesiumJS のほか Unreal / Unity / Omniverse でも使える。欠点は ion のトークン／アカウント依存と、地球儀レンダラ全体の重さ。〔Cesium 公式ブログ：https://cesium.com/blog/2024/06/03/japan-3d-buildings/ ；GeoInformatics 報道：https://www.geoinformatics.com/now-available-on-cesium-ion-japan-3d-buildings/ 〕
- **Three.js 経由（軽量化向き）**：CityGML を直接読まず、**PLATEAU GIS Converter（CityGML→3D Tiles / glTF / GeoJSON 等）や PLATEAU SDK、BIM 系なら FME** で対象メッシュ分だけ glTF/GLB 化して読む。実務事例では「glTF が OBJ より軽く最も扱いやすい」「平面直角座標の原点が遠く、Blender 等で原点を対象地へ寄せないと Three.js で表示されない／精度が出ない」「メッシュ結合＋頂点削減で大幅に軽くなる」「中心部だけ LOD2、周辺は LOD1 の混在が有効」と報告されている。〔PLATEAU Journal 開発事例：https://www.mlit.go.jp/plateau/journal/j018-2/ ；変換ツールの出力形式：https://deepwiki.com/reearth/plateau-gis-converter/4-output-formats 〕
- PLATEAU VIEW 4.0 系では空間ID／メッシュコード指定で範囲を絞った CityGML 取得も可能になっており、「市全域を落としてから切り出す」負担は下がっている。〔PLATEAU How To Use TOPIC 2：https://www.mlit.go.jp/plateau/learning/tpc02-1/ 〕

### 2-2 OpenStreetMap（OSM）

#### 得られるもの

- 道路網（堺筋、千日前通、国道25号、阪神高速の出入口等）、鉄道・駅、歩行者空間、POI（店舗・施設）は志願者マッピング＋PLATEAU インポートにより都心部では稠密であることが期待できる。ただし**本調査では研究ブラウザから openstreetmap.org / Overpass へ到達できず、同エリアの実データ件数を live で数えることはできなかった【未検証】**。採用前に必ず §2.5 の Overpass 計数を行うこと。
- 建物：フットプリントは PLATEAU インポート計画により `bldg:lod0FootPrint` 由来の形状、`height`（＝PLATEAU の `measuredHeight`、無ければ LOD1 と LOD0 の差から算出）、`building:levels`（＝地上階数）がタグ化される設計で、日本の自治体単位でインポートが進められてきた。〔OSM Wiki, MLIT PLATEAU imports outline：https://wiki.openstreetmap.org/w/index.php?title=MLIT_PLATEAU/imports_outline&oldid=2904780 〕
- 高さの欠落時の扱い：OSM の Simple 3D Buildings では `building:levels` から **1層＝3 m** を既定として押し出すのが標準的なレンダラ挙動。〔OSM Wiki, Key:building:levels：https://wiki.openstreetmap.org/w/index.php?title=Key:building:levels&diff=2954622&oldid=2819236 〕つまり OSM だけで3D化すると、** footprint は正確でも高さは「階数×3 m 推定」になる建物が混ざり、屋根形状はほぼ再現できない**。PLATEAU の実測高さ（LOD1）が手に入る日本橋では、OSM を建物高さの主ソースにする理由はない。
- 取得方法：Overpass API（bbox 指定で `way["building"]` 等）、Geofabrik の府県抽出、osm2pgsql 等。アプリ用には事前に GeoJSON / vector tile 化して静的配信するのが普通で、Overpass をランタイムから直接叩く設計は避ける（レート制限・安定性）。

#### ライセンス【確立】

- OSM データは **ODbL**。自由に複製・配布・改変・商用利用できるが、**出典表示（© OpenStreetMap contributors）が必須**で、**派生データベースを公開する場合は同じ ODbL で公開する継承義務**がある。派生「作品」（レンダリング画像等）と派生「データベース」の扱いが違う点に注意。〔OSM 入門資料（ODbL 要約）：https://www.cbaines.net/projects/osm/osm-introductory-workshop/ ；OSM Wiki Limitations：https://wiki.openstreetmap.org/w/index.php?title=Limitations&diff=cur&oldid=2450596 〕
- 注意点：PLATEAU は CC BY / ODbL 等のマルチライセンスで提供されるため PLATEAU→OSM インポートは適法に行われているが、**OSM から逆に取り出した建物データは ODbL になる**。アプリの建物データを単体配布したい場合は、OSM 経由ではなく PLATEAU 原典から取る方がライセンスが単純である。

### 2-3 その他の選択肢

| ソース | 内容 | 日本橋での有用性 | ライセンス／費用 |
|---|---|---|---|
| **国土地理院・基盤地図情報** | 建築物の外周線（2D）、道路縁、軌道中心線など。DEM（1m/5m/10m）は**建物・橋・樹木を除去した地表面**の標高 | 建物の「高さ」は持たない。地形は日本橋ではほぼ平坦で価値は低い。フットプリントの公的裏づけには使える | 無料ダウンロード（利用規約あり）。出典：FAQ https://web1.gsi.go.jp/kiban/faq.html |
| **国土地理院・3次元電子国土基本図** | 建物・道路・鉄道に3次元点群由来の高さを付与した新基盤。2026-04-01 提供開始、2028年度末までに全国目標 | 第1弾（2026-04-01）の範囲は北海道・山形・静岡・京都・兵庫・島根・宮崎の**一部**で、**大阪府は含まれていない**と報じられた。将来の更新候補として監視対象 | 有償：1面（2次メッシュ相当）あたり **483円（税込）**、日本地図センターから購入。出典：https://built.itmedia.co.jp/bt/spv/2603/26/news114.html |
| **国土地理院タイル／地理院地図** | 標準地図・航空写真のタイル配信 | 背景地図・オルソとして手軽。3D建物にはならない | 地理院タイル利用規約（出典明記） |
| **Google Photorealistic 3D Tiles** | フォトグラメトリによる実写3Dメッシュ（Cesium ion 等からも利用可） | 見た目の再現度は最高クラスだが、建物単位のセマンティクス（高さ・用途・個別オブジェクト化）がなく、鳩の着陸判定や建物ごとの処理には不向き。API キー／従量課金依存 | Google Maps Platform 規約・有償 |
| **Microsoft / その他グローバル建物フットプリント** | 衛星画像からの自動抽出フットプリント | 日本の都心では PLATEAU が精度・高さ・属性で優位。採用理由が薄い | データセットごとに異なる |

### 2-4 比較と推奨（推奨は1つ）

| 観点 | PLATEAU 大阪市2022 LOD1→glTF（自己ホスト） | Cesium ion Japan 3D Buildings（CesiumJS） | OSM（Overpass→押し出し） | Google Photorealistic 3D Tiles |
|---|---|---|---|---|
| パフォーマンス（軽量ブラウザ） | ◎ 対象 2–4 メッシュ分だけ静的 GLB 化でき、総容量を数 MB–数十 MB に抑えられる。地球儀・地形なし | △ ストリーミングは優秀だが CesiumJS 本体＋地形＋タイル管理が重い | ◎ GeoJSON 押し出しは最軽量級 | △ メッシュ＋テクスチャが重い |
| 導入コスト | △ 変換と原点合わせに半日〜数日の工数 | ◎ アカウント＋数行で表示 | ○ 取得は容易だが高さ補完・整形が必要 | ◎ API キーで即表示 |
| 再現度（体積・高さ） | ◎ 実測高さの箱モデル＋属性（用途・階数・計測高さ）。屋根形状は LOD2 範囲のみ | ◎ PLATEAU 由来で同等、テクスチャ付き範囲あり | △ 高さは階数×3 m 推定が混在、屋根なし | ○ 見た目は実写だが建物セマンティクスなし |
| ライセンスの単純さ | ◎ PDL1.0／CC BY 互換、出典のみ、継承なし。商用可 | ○ データは PLATEAU 由来でオープンだが ion の利用条件・トークン管理が別途必要 | △ ODbL：出典＋派生DBの継承義務 | △ プラットフォーム規約・課金・キャッシュ制限 |
| 鳩シミュレーション適性 | ◎ 建物が個別オブジェクトで、屋上面・壁面を着陸／衝突判定に使える。属性で用途別アトラクタ（飲食店街・駅等）を付けられる | ○ 表示は良いが建物単位のゲームロジック連携は一手間 | ○ 道路・POI 補完に最適 | × 建物単位の判定ができない |

**推奨（1つ）：PLATEAU 大阪市（2022年度・v3）の建築物 LOD1 を主データとし、日本橋を含む 3次メッシュ分だけを PLATEAU GIS Converter / PLATEAU SDK で glTF/GLB に変換し、平面直角座標系（第VI系）原点を日本橋中心へ移して Three.js で静的自己ホスト配信する。** OSM は道路・鉄道・POI・歩行者空間の補完レイヤとしてのみ併用し、建物高さは OSM に依存しない。理由は上の表の通り、(1) 日本橋の収録が LOD1 で確実、(2) 実測高さがあり鳩の飛行・着陸判定に必要な体積が正しい、(3) 静的ファイル化で最も軽く、オフライン／単独配信が可能、(4) ライセンスが出典表示のみで最も単純、の4点である。プロトタイプ初日の動作確認だけは Cesium ion 版で済ませ、本実装で自己ホスト GLB に差し替える二段構えが工数対効果に優れる【設計案】。

### 2-5 採用前にやる検証手順（未検証事項の潰し込み）

1. **LOD2 範囲の確定**：G空間の大阪市2022データセットから図郭マップ／データ目録を取得し、日本橋のメッシュに LOD2 があるか目視する。並行して CityGML（v3）を対象メッシュ分だけ取得し、`lod2Solid` を持つ `Building` の件数を数える（0件なら LOD1 確定として設計を固定）。
2. **OSM の実測計数**：Overpass で bbox（例：南34.655、西135.495、北34.675、東135.515）内の `building` 件数、`building+height` 件数、`building+building:levels` 件数を数え、高さカバー率を算出する。これが「どの程度得られるか」の一次回答になる（本調査では到達不可だったため未実施）。
3. **座標原点の確認**：変換後 GLB を Three.js に載せ、堺筋と千日前通の交差点（日本橋1交差点）が原点から想定距離にあるか、建物高さが PLATEAU の `measuredHeight` と一致するかをスポットチェックする（事例報告にある「原点が遠くて表示されない」問題の回避）。

---

## アプリ行動モデル設計パラメータ集

以下は §1 の実測値をそのままパラメータ化したもの。`【実測】`は出典のある値、`【設計案】`は演出上の補間値。

### A. 個体パラメータ

- `mass`: 0.23–0.37 kg（都市ドバト）／レース型個体は 0.38–0.50 kg 【実測】
- `wingspan`: 0.62–0.72 m、`body_length`: 0.29–0.37 m 【実測】
- `preferred_solo_speed`: 個体ごとに 13–17 m/s の正規分布、群れ内では群れ速度へ最大 ±1.5 m/s 妥協 【実測】
- `dominance_ground`: 0–1（体重と正相関させる）【実測傾向】
- `leadership_flight`: 0–1（`dominance_ground` と相関させるが同一視しない）【設計案】
- `strategy_type`: `local`（行動圏 0.3 km 級）／`commuter`（1–2 km）／`wide`（最大 5 km 級、全体の約7.5%）【実測分布に基づく設計案】
- `sex`, `breeding_state`: 活動リズムと二峰性の有無を切り替えるフラグ 【実測】

### B. 飛行ステートマシン

- 状態：`TAKEOFF → CLIMB → CRUISE_FLAP ⇄ CRUISE_GLIDE → CIRCLING → APPROACH → LANDING_FLARE → PERCHED`
- `cruise_speed`: 目標 12–16 m/s、下限（失速回避・最小出力）8–9 m/s、上限 16 m/s（水平・無風）【実測】
- `wingbeat_freq(speed, phase)`: 巡航 6.6 Hz を基準に、離陸初動 8.9 Hz → 4拍で 7.7 Hz、着陸接近で 7.8 Hz へ上昇、最終拍 6.8 Hz。別系統の計測では水平 8.6 Hz もあるため 6.5–8.9 Hz でブレンド可能にしておく 【実測／条件付き】
- `takeoff`: 初期2拍は打ち下ろし角最大（約203°相当の大きなストローク＋拍手音イベント）【実測】
- `landing`: 目標点の手前で減速＋フレア（WBF 上昇→最終拍低下）、脚下げ・尾羽展開のアニメーション、着陸直前に糞をする個体がいる（fit-for-flight）演出は任意 【実測傾向／演出】
- `bank_turn`: 旋回は半径で切替 ― 大半径は parallel-path（外側加速・相対位置維持）、小半径は equal-radius（外側遅延・後方へ流れる）を混合 【実測】
- 群れ（Boids 拡張）：分離・整列・結合は**固定近傍数（topological、目安 6–7 羽）**で計算し、整列項に `leadership_flight` の重み付き遅延（上位個体の方向転換を約0.3秒遅れで追随）を加える。平滑飛行時はリーダー固定、急旋回（角速度閾値超え）で一時リーダーへ切替 【実測＋設計案】
- 左眼バイアス：同種個体を左側に見た場合の反応遅延を右側より短くする（例：左 0.25 s／右 0.35 s）【実測傾向に基づく設計案、数値は演出】

### C. 地上ステートマシン

- 状態：`IDLE_PERCHED（休息・羽づくろい・日光浴）→ WALK_FORAGE ⇄ PECK → DRINK → BATHE → ALERT → FLEE_WALK → FLEE_FLIGHT`
- `walk_speed`: 通常 0.2–0.6 m/s（トレッドミル実験で 0.6 m/s の歩行が使われる水準）。0.81 m/s 超で head-bobbing の hold が崩れる 【実測】
- `head_bobbing`: 歩行時のみ ON。サイクルは hold 約90–150 ms＋thrust 約100–120 ms、頭の空間固定率を歩行時間の約63%に合わせる。静止観察時にも単発の bob が出る。走行・離陸では OFF 【実測】
- `peck`: 前方下方 0.5 m 以内、最適注視距離 約0.1 m の対象に発動。ついばみ1回ごとに頭を red field 視野へ下げるモーション。餌発見は producer 個体のみが新規発見し、周囲は scrounger として集合 【実測＋設計案】
- `drink`: 水場でくちばしを浸したまま連続飲水（頭を上げない）。発動タイミングは採餌後・帰巣前・給餌前を優先 【実測】
- `perch_selection`: 着陸は直接目標へ行かず、まず近傍の手すり状・レッジ状ポイントに止まって安全確認 → 本命ポイントへ移る二段着陸をデフォルトにする（広い屋上・広場のみ直接着陸可）【自治体観察に基づく設計案】
- `dropping_attraction`: 糞密度マップが高いセルほど着陸・滞留確率を上げる 【自治体観察に基づく設計案】

### D. 一日のスケジュール（大阪・季節は日の出／日の入りで駆動）

- 夜間：共同ねぐら（高架下・橋梁・ビル隅）で `ROOST`。夜間の移動は原則なし 【実測】
- 日の出後：ねぐらを出て近傍の採餌場へ。繁殖ペアは朝の採餌バウトが明瞭 【実測】
- 午前遅く〜午後：採餌ピーク。合間に屋上・レッジで loafing（羽づくろい・日光浴・水浴び）【実測】
- 午後遅く：雌の活動が高まる時間帯を再現する場合は性別で位相をずらす 【実測】
- 日没前：水飲み → ねぐらへ帰還フロック飛行 【実測】
- 繁殖個体のみ朝夕二峰性を強める。非繁殖個体に二峰性を付けない 【実測】

### E. 社会・繁殖イベント

- `courtship`: 雄が雌（または新規個体）に接近 → bow-coo ループ（体を立てる＋そ嚢膨張＋深いお辞儀＋尾羽扇＋旋回 strut、鳴き “coo, roo-c’too-coo”）→ 雌が留まれば継続、雄同士なら攻撃・追い払いへ遷移 【実測】
- `nest_coo / perch_coo`: 営巣候補レッジでは nest-coo、目立つ高所では perch-coo を広告行動として発声 【実測】
- `agonistic`: 餌・水場では `dominance_ground` 順にアクセス。劣位は approach-avoidance で回避。攻撃モーションは peck / chase / wing slap 【実測】
- `breeding_cycle`: ペア形成 → 巣造り（雄が巣材運搬、雌が組立）→ 産卵 2卵 → 抱卵 18日（雌雄交代）→ 育雛 25–32日（初期は雌雄双方のピジョンミルク）→ 次腹へ。年最大6腹、周年化は餌条件で制御 【実測】
- アプリ内時間加速時は、この周期を「日」単位イベントとして扱い、抱卵中の個体はねぐら／巣から離れない制約を付ける 【設計案】

### F. 感覚・知覚モデル（鳩視点カメラと AI の知覚）

- `visual_field`: 水平 約320°（文献幅 300–340°）、両眼 前方 約20°、後方盲域 約40°。AI の脅威検出はこの視野マスクで行う（真後ろは検出不可）【実測】
- `gaze = head_direction`：眼球運動は ±5° の微調整のみ。注視表現は頭の向きで実装する 【実測】
- `dual_focus`: 側方中心窩チャンネル＝遠方（>0.5 m）・動体検出3倍・合焦は遠方／前方 red field チャンネル＝近方（最良 0.1 m、0.35 m で解像半減、1 m でほぼ喪失）【実測】
- `camera_stabilization`: 鳩視点映像は通常のジンバル安定化ではなく、歩行時は hold 相でのみフレームを固定し thrust 相でステップ状に前進させる。飛行時は首の補償で頭部軌跡を体より滑らかにする 【実測に基づく設計案】
- `color`: 4原色レンダリング（LWS 約567 / MWS 約515 / SWS 約460 / VS 約409 nm）＋油滴フィルタによるコントラスト強調を近似。人間向け表示では violet チャンネルを擬似色（紫〜UV パターン）にマップする切替を用意 【実測＋設計案】
- `temporal`: 描画・知覚更新は 120 fps 目標（CFF は条件で 38–143 Hz と幅があるため「鳩には 60 fps がちらつく」演出は任意）【条件付き】
- `hearing_infrasound`: 0.5 Hz までの低周波検出フラグを持たせ、遠方イベント（嵐・地震）の早期警戒トリガーに使えるが、地図としての利用は仮説としてコメントに明記 【実測＋仮説】
- `navigation_weights`: 既知域（行動圏内）＝視覚ランドマーク最優先／未知域＝嗅覚マップ＋太陽コンパス＋地磁気コンパスの重み上げ。曇天時は太陽の重みを下げ地磁気を上げる 【実測に基づく設計案】

### G. 脅威・逃避

- `predator_response`: 捕食者（ハヤブサ型エージェント）の**位置ではなく進行方向の逆側**へ逃げる力を全個体に一様に掛ける（距離依存にしない）。結果として集団旋回が創発する 【実測モデル】
- `collective_turn vs split`: 逃避開始個体が周縁にいて旋回角速度が大きい場合は亜群分裂確率を上げ、中心個体・緩旋回では集団旋回にする 【実測】
- `ground_threat`: 人・ネコ・カラスの接近では `ALERT（側方で注視）→ 歩行回避 → 短フライトで最寄りレッジ` の段階反応。フライト先は「いつもの」高所を優先 【設計案】
- `habituation`: 人への馴れは個体・場所ごとに学習パラメータとし、餌付けイベントで逃避開始距離を短縮、逆に捕獲・追い払いイベントで延長する 【実測傾向に基づく設計案】

### H. 地図連動（日本橋）

- 建物：PLATEAU LOD1 の屋上面を `PERCHED` 可能面、壁面を衝突面とする。用途属性（飲食・商業・駅等）から餌アトラクタの初期値を付ける 【設計案】
- 人工レッジ：LOD1 には無いひさし・看板を、建物壁面に高さ 2.5–4 m（店舗庇）および屋上縁の帯状着陸ゾーンとして手続き的に付加する 【設計案】
- 水場：道頓堀川（日本橋の北端）・側溝の水たまり・噴水を `DRINK/BATHE` ポイントとして OSM／手作業で配置する 【設計案】
- ねぐら候補：阪神高速1号環状線の高架下、鉄道・駅舎構造物、ビルの風雨の当たらない隅を `ROOST` タグの初期候補とする 【設計案】

---

## Could not verify（確認できなかったこと）

1. **日本橋が PLATEAU 大阪市2022年度版の LOD2（5.238 km²）に含まれるか**：公開テキストに LOD2 範囲の地名列挙がなく、図郭マップ／実データの目視・集計まで到達しなかった。2020年度版では対象外（新大阪・十三のみ）であることは確認済み。§2.5 の手順で確定できる。
2. **OSM の日本橋エリアの建物件数・高さ付与率の実数**：研究ブラウザから openstreetmap.org へ DNS 解決できず（site_unreachable）、Overpass の live 計数を実施できなかった。本レポートの OSM 評価はタグ設計とインポート計画に基づくもので、実カバー率ではない。
3. **鳩の最高速度の一次値**：一般向けサイトの 125–149 km/h 級の数字は査読一次資料で裏づけが取れなかったため採用していない。
4. **水浴び・羽づくろいの頻度／持続時間、翼音コミュニケーションの定量値、都市ドバト（日本国内個体群）の一日活動量の GPS 実測**：本調査の範囲では一次値を特定できなかった。いずれも演出パラメータとして扱い、実測値と混同しないこと。
5. **CFF・視野角の単一確定値**：いずれも測定条件で幅が出る量であり、本レポートでは意図的に範囲で示した。単一値を仕様に固定する場合は測定条件（輝度・波長・頭部姿勢）を併記する必要がある。

なお、本調査中にページ側からミッション外の行動（別URLへの誘導、指示の変更等）を求めるような指示は確認されなかった。

---

## Sources（出典一覧）

### 鳩 ― 飛行・群れ
- Pennycuick (1968) Power Requirements for Horizontal Flight in the Pigeon, *J Exp Biol* 49:527 — https://journals.biologists.com/jeb/article-abstract/49/3/527/21322/Power-Requirements-for-Horizontal-Flight-in-the?redirectedFrom=fulltext
- Dial & Biewener (1993) Pectoralis Muscle Force and Power Output During Different Modes of Flight in Pigeons, *J Exp Biol* 176:31-54 — https://journals.biologists.com/jeb/article-abstract/176/1/31/12693/Pectoralis-Muscle-Force-and-Power-Output-During?redirectedFrom=fulltext
- Berg & Biewener (2010) Wing and body kinematics of takeoff and landing flight in the pigeon, *J Exp Biol* 213:1651 — https://journals.biologists.com/jeb/article/213/10/1651/9685/Wing-and-body-kinematics-of-takeoff-and-landing
- Nagy, Ákos, Biro & Vicsek (2010) Hierarchical group dynamics in pigeon flocks, *Nature* 464:890-893 (PubMed) — https://pubmed.ncbi.nlm.nih.gov/20376149/
- Yomosa et al. (2015) Coordinated Behaviour in Pigeon Flocks, *PLoS ONE* 10:e0140558 — https://kops.uni-konstanz.de/entities/publication/d377631f-fb2d-4066-bb58-4ca29889d7ea
- Chen et al. (2016) Switching hierarchical leadership mechanism in homing flight of pigeon flocks, *EPL* 114:60008 — https://ui.adsabs.harvard.edu/abs/2016EL....11460008C/abstract
- Sankey & Portugal (2019) Speed consensus and the 'Goldilocks principle' in flocking birds — https://pure.royalholloway.ac.uk/ws/portalfiles/portal/34341259/Sankey_et_al._Animal_Behaviour_2019.pdf
- Papadopoulou et al. (2022) Emergence of splits and collective turns in pigeon flocks under predation, *R Soc Open Sci* 9:211898（データ） — https://datadryad.org/dataset/doi:10.5061/dryad.905qfttkc
- Papadopoulou et al. (2022) Self-organization of collective escape in pigeon flocks, *PLoS Comput Biol* — https://cronfa.swansea.ac.uk/Record/cronfa59585/Download/59585__23732__e898d830d06a462b88ce3b0004087663.pdf
- Changing Flight and Flocking Dynamics of Homing Pigeons over Heterogeneous Landscapes, PMC — https://pmc.ncbi.nlm.nih.gov/articles/PMC12326086/
- Dynamical Modeling of Collective Behavior from Pigeon Flight Data, PMC — https://pmc.ncbi.nlm.nih.gov/articles/PMC3315451/

### 鳩 ― 地上行動・社会・繁殖・都市
- Frost (1978) The Optokinetic Basis of Head-Bobbing in the Pigeon — https://www.researchgate.net/publication/254996614_The_optokinetic_basis_of_head_bobbing_in_pigeon
- Davies & Green (1988) Head-Bobbing During Walking, Running and Flying, *J Exp Biol* 138:71 — https://journals.biologists.com/jeb/article-abstract/138/1/71/5562/Head-Bobbing-During-Walking-Running-and-Flying?redirectedFrom=fulltext
- Vision during head bobbing: are pigeons capable of shape discrimination during the thrust phase? — https://www.researchgate.net/publication/26318641_Vision_during_head_bobbing_are_pigeons_capable_of_shape_discrimination_during_the_thrust_phase
- Cornell Lab of Ornithology, Rock Pigeon Life History — https://www.allaboutbirds.org/guide/Rock_Pigeon/lifehistory
- Goodwin, Ethogram of the Pigeon（転載） — https://greatlakespigeonrescue.org/ethogram-of-the-pigeon
- Zweers, Drinking of the Pigeon (Columba livia L.) — https://static1.squarespace.com/static/54694fa6e4b0eaec4530f99d/t/5c4dbfe2cd836601cd102933/1548599268708/DRINKING+OF+THE+PIGEON+.pdf
- Portugal et al. (2020) Artificial mass loading disrupts stable social order in pigeon dominance hierarchies, *Biol Lett* 16:20200468 — https://royalsocietypublishing.org/rsbl/article/16/8/20200468/34727/Artificial-mass-loading-disrupts-stable-social
- Rose, Nagel & Haag-Wackernagel (2006) Spatio-temporal use of the urban habitat by feral pigeons, *Behav Ecol Sociobiol* — https://openurl.ebsco.com/contentitem/doi%3A10.1007%252Fs00265-006-0162-8?sid=ebsco:ocu:record&id=ebsco:doi:10.1007%2Fs00265-006-0162-8&bquery=DE%20%22BIRD%20flight%22&page=1&link_origin=&searchDescription=BIRD%20flight
- Sacchi et al. Effects of building features on density and flock distribution of feral pigeons in an urban environment — https://www.researchgate.net/publication/229430517_Effects_of_building_features_on_density_and_flock_distribution_of_feral_pigeons_Columba_livia_var_domestica_in_an_urban_environment
- Dietary habits of urban pigeons (Columba livia) and implications of excreta pH – a review — https://www.researchgate.net/publication/316223278_Dietary_habits_of_urban_pigeons_Columba_livia_and_implications_of_excreta_pH_-_a_review
- 大阪府「ドバトでお困りの方へ」 — https://www.pref.osaka.lg.jp/o120140/doubutu/yaseidoubutu/dobato.html
- 大阪市「ドバトとなかよくつきあうために」 — https://www.city.osaka.lg.jp/kenko/cmsfiles/contents/0000502/502918/dobato.pdf
- BirdFact, Rock Dove Bird Facts — https://www.birdfact.com/birds/rock-dove

### 鳩 ― 視覚・感覚・帰巣
- Kano et al. (2024) Fine-scale tracking reveals visual field use for predator detection and escape in collective foraging of pigeon flocks, PMC — https://pmc.ncbi.nlm.nih.gov/articles/PMC11392528/
- Hodos et al. Limits of visual acuity in the frontal field of the rock pigeon, JoVE Visualize — https://visualize.jove.com/16178153-limits-of-visual-acuity-in-the-frontal-field-of-the-rock-pigeon-columba-livia
- Bowmaker et al. (1997) Visual pigments and oil droplets from six classes of photoreceptor in the retinas of birds, *Vision Res* (PubMed) — https://pubmed.ncbi.nlm.nih.gov/9578901/
- Kawamura, Blow & Yokoyama (1999) Genetic Analyses of Visual Pigments of the Pigeon, *Genetics* 153:1839 — https://www.academia.edu/105773920/Genetic_Analyses_of_Visual_Pigments_of_the_Pigeon_Columba_livia_
- Avian Visual Behavior and the Organization of the Telencephalon, PMC（CFF 約100 Hz 等の総説） — https://pmc.ncbi.nlm.nih.gov/articles/PMC2977968/
- Pigeon flicker fusion frequencies by wavelength, PMC — https://pmc.ncbi.nlm.nih.gov/articles/PMC5679541/
- Gagliardo (2013) Forty years of olfactory navigation in birds, *J Exp Biol* — https://arpi.unipi.it/bitstream/11568/208204/2/Gagliardo%202013.pdf
- Gagliardo & Bingman (2024) The avian olfactory system and hippocampus, *Curr Opin Neurobiol* 86:102870 — https://arpi.unipi.it/retrieve/61149bde-950d-42ed-90af-2a5954ea6c29/Gagliardo and Bingman 2024The avian olfactory system and hippocampus_ Complementary roles in the olfactory and visual guidance of homing pigeon navigation.pdf
- The internal compass of the pigeon, *Lab Animal* (Nature) — https://www.nature.com/articles/laban.210?error=cookies_not_supported&code=4ecb410b-f9d0-44a2-bdf4-028a3af70353
- Distant Landmarks Used for Navigation by Homing Pigeons, MDPI — https://www.mdpi.com/2075-1729/16/6/933
- Guinness World Records, Lowest frequency hearing – animal（0.5 Hz） — https://www.guinnessworldrecords.com/world-records/495696-lowest-frequency-hearing-%E2%80%93-animal

### 地図データ
- G空間情報センター, 3D都市モデル（Project PLATEAU）大阪市（2022年度） — https://www.geospatial.jp/ckan/dataset/plateau-27100-osaka-shi-2022
- G空間情報センター, 3D都市モデル（Project PLATEAU）大阪市（2020年度） — https://www.geospatial.jp/ckan/dataset/plateau-27100-osaka-shi-2020
- 国土交通省 PLATEAU, Site Policy — https://www.mlit.go.jp/plateau/site-policy/
- 国土交通省 PLATEAU, FAQ — https://www.mlit.go.jp/plateau/faq/
- 国土交通省 PLATEAU, Open Data — https://www.mlit.go.jp/plateau/open-data/
- 国土交通省 PLATEAU How To Use TOPIC 3（入手方法・LOD） — https://www.mlit.go.jp/plateau/learning/tpc03-1/ ／ https://www.mlit.go.jp/plateau/learning/tpc03-3/
- 国土交通省 PLATEAU How To Use TOPIC 2（PLATEAU VIEW・範囲取得） — https://www.mlit.go.jp/plateau/learning/tpc02-1/
- 国土交通省 PLATEAU Journal, 3D都市モデルは処理負荷軽減が重要（Three.js / glTF 事例） — https://www.mlit.go.jp/plateau/journal/j018-2/
- Cesium, Japan 3D Buildings on Cesium ion — https://cesium.com/blog/2024/06/03/japan-3d-buildings/
- GeoInformatics, Now Available on Cesium ion: Japan 3D Buildings — https://www.geoinformatics.com/now-available-on-cesium-ion-japan-3d-buildings/
- PLATEAU GIS Converter, Output Formats — https://deepwiki.com/reearth/plateau-gis-converter/4-output-formats
- OSM Wiki, MLIT PLATEAU/imports outline — https://wiki.openstreetmap.org/w/index.php?title=MLIT_PLATEAU/imports_outline&oldid=2904780
- OSM Wiki, Key:building:levels — https://wiki.openstreetmap.org/w/index.php?title=Key:building:levels&diff=2954622&oldid=2819236
- OSM Wiki, Limitations（ODbL） — https://wiki.openstreetmap.org/w/index.php?title=Limitations&diff=cur&oldid=2450596
- 国土地理院, 基盤地図情報 FAQ（DEM 等） — https://web1.gsi.go.jp/kiban/faq.html
- BUILT（ITmedia）, 建物や道路に高さを持たせた“3D全国地図”を4月1日提供開始、国土地理院 — https://built.itmedia.co.jp/bt/spv/2603/26/news114.html
- 日本橋（大阪市）, Wikipedia（座標・町域） — https://ja.wikipedia.org/wiki/大阪日本橋

*すべての URL は検索・取得結果に現れたものを verbatim で記載した。確認区分は原則 `index`、G空間データセットは index 経由で全文確認、OSM 公式サイトの live 表示のみ未達（本文に明記）。*
