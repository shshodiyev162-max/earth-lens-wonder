# TerraScope

**An Earth system trend detective, built on NASA data.** Pick a measure, a place and the years — say vegetation in Uzbekistan since 2015, or sea temperature in the Mediterranean since 2003. TerraScope reads one NASA map per month, tests every pixel and the whole area for a real trend, ranks the places that changed most, and says plainly when a change is *not* significant.

Everything runs in the browser against public NASA and OpenStreetMap services: no API keys, no backend, no simulated numbers.

**Try it:** `npm install && npm run dev`, open the app and press **Watch a demo** on the home page. Three worked examples play through the app with live NASA data (script for presenters: [DEMO.md](DEMO.md)).

## What it does

| Feature | In TerraScope |
| --- | --- |
| **Measures** | 30 measures of the land, water and snow, the air, gases and dust, and the sea (table below), grouped in the picker and each with a one-line plain definition. **"Suggested for this place"** picks the measures that suit the place from NASA's land cover map: dust and heat for deserts, surface heat and SO₂ for cities, sea temperature and the air above it for seas, and for a lake its open water and surface temperature first. That map keeps lakes and seas at a fixed outline, so where at least a fifth of its water was dry last summer by NASA's vegetation maps (the Aral Sea), that part counts as bare ground, and the card says so. |
| **Places** | Any country, lake or sea clicked on the map (“Country, lake or sea”, on every map page), any place found by search, a continent or a known region, lake, sea or ocean from a list (Europe, Asia, Western Europe, Southeast Asia, the Balkans, Central Asia, the Aral Sea, Lake Urmia, the Great Lakes, the Mediterranean, the Atlantic and Pacific halves…), a rectangle, polygon or circle drawn on the map, a saved area, or the map view. Several can be added together and read as one area (“Uzbekistan + Kazakhstan”): “Add another place” on Trends and Analysis, or “Combine” in Your areas on the map pages. Land two places share is counted once, and a link keeps every place. Searching for a sea gives its whole water area, not a point, and searching for a continent or a region such as Europe or West Africa gives the land of its countries, not a box drawn around it. Deserts and forests that OpenStreetMap has only as a point (the Sahara, the Gobi, the Congo Basin) are boxes around them, and say so. Every search box suggests places as you type, saying what each one is (city, village, lake, airport); a place named exactly what was typed comes first, short names find their country (“USA”, “UK”, “UAE”), coordinates can be typed in degrees and minutes (39°46'N 64°25'E), and words that name a NASA layer (“NDVI”, “snow cover”) show the layers first. A country found by search is read from the same land outline as one clicked on the map. A place is outlined, and its land cover described, as soon as it is chosen. Land measures leave out lakes and seas, sea measures leave out land, and air measures cover both, except over a named sea, where only its water is read. The land/water map misses some lakes (Lake Victoria and Lake Balkhash read as land there), so lakes are also taken from NASA's land cover map, less any bed the vegetation maps saw dry last summer, which stays land. A lake's surface temperature is read wherever NASA's sea temperature map has values. A measure that can't be read in a place (vegetation over a sea, sea temperature over a landlocked country) is explained before any map is read. |
| **Time series** | Monthly NASA maps from 2000 (MERRA-2 records reach back to 1980; the scan starts at the MODIS era). Each pixel and each area become one value per year for the chosen months, so the seasonal cycle can't fake a trend. Year-by-year charts for the whole area and every hotspot, a monthly animation on the map, a yearly and a monthly chart for every measure on the Analysis page, and a CSV download. |
| **What may be behind it** | For a clear change in plants, ground heat, water, snow or dust, “Look for possible causes” checks NASA's records for the place and lists up to three causes that fit, each with its evidence and how strong it is: drier, wetter, warmer or windier years; fire; a one-off event; something other than the weather; more people. It says what it checked and what it can't measure, and never names “the” cause. |
| **Rate of change and significance** | **Mann–Kendall** trend test (tie-corrected; seasonal version for monthly data) and **Sen's slope** with its **95% confidence range**, per year and per decade, for the whole area, every hotspot and every pixel. Where one year carries over into the next (a warm sea stays warm), the test allows for it (Yue and Wang 2004), so a slow swing can't pass for a trend. Hotspots use **clear trends only**: each pixel is held to a 5% false discovery rate (Benjamini–Hochberg), so testing thousands of pixels at once can't fill the map with chance results, and a **chance check** shuffles the years and tests every pixel again to show whether chance alone makes patches as strong (a permutation test on the patches). **Welch's t-test** when comparing two periods (e.g. 2001–2010 vs 2016–2025). When a trend isn't significant, TerraScope says so, works out roughly how many years of record a trend of that size would need to show (Weatherhead et al. 1998) and offers to test the whole record. A **rise then a fall** (or a fall then a rise) that cancel out are found and named instead of being called "no clear trend": see 6 below. |
| **Checked against the ground** | On the Analysis page, NASA's yearly air temperature and rainfall are compared with the nearest weather station within 75 km (NOAA's Global Summary of the Month), over the years both have: **Consistent** when the two 95% ranges overlap and the station's is narrow enough to have shown a difference, **Too uncertain to tell** when its years vary too much to say, **Differs** when the ranges don't overlap; and how closely the years follow each other. NASA's rainfall is partly corrected with rain gauges, so for rain the two aren't fully independent, and the page says so. Where no station has enough years, it says so. |
| **World change atlas** | The **Atlas** page shows where six headline measures (vegetation, surface heat, air temperature, rainfall, snow cover, sea temperature) changed most from 60°S to 80°N, every month of every year since 2003, tested pixel by pixel. It is measured ahead of time with the app's own scanner and bundled, so it opens instantly; each change opens on the Trends page for a closer look. |

Also:
- **Written for students and the public.** Plain words throughout, a "What does each one measure?" list, and a "Words used here" glossary of trend, p-value, 95% range, Sen's slope and the rest.
- **A step-by-step form.** The Trends form asks what to measure, where, when and which months, without typing. The years are dragged on a timeline (with Last 5, 10, 20 and All as quick choices) that shows which years the change compares and where a chosen measure's record is shorter; the Analysis page uses the same timeline, for one span or for Then and Now.
- **Guided demos.** Three worked examples you can watch, with live data.
- **Suggestions that suit the place.** Land-cover-based suggestions, made by fixed written rules rather than AI.
- **Seasonal cycles removed.** Seasonal statistics and same-months-every-year comparisons.
- **Weak trends still shown.** Every rate is shown with its range, even when it isn't significant, and there's a one-click "test every year since 2000".
- **A first look in seconds.** A scan reads one map a year first and shows a provisional answer, then fills in the other months.
- **Save as PDF.** The Analysis report prints on white paper, without the controls, through the browser's own Save as PDF.
- **40 NASA layers to look at.** The map pages (Explore, Compare, Sync) show the daily photos and science maps, the monthly records Trends measures (rainfall, soil moisture, water storage, ozone, methane, sea salinity and more) and the yearly land cover with its named categories. Coarse layers say how big a pixel is (MERRA-2 is about 50 km). Monthly maps are picked by month and yearly ones by year, with a slider to scrub through the whole record.

## The measures

| Group | Measure | NASA product | Record |
| --- | --- | --- | --- |
| Land and plants | Vegetation (NDVI) | MODIS Terra monthly NDVI (MOD13A3), ~1 km | 2000– |
| Land and plants | Leaf density (EVI) | MODIS Terra monthly EVI (MOD13A3), ~1 km | 2000– |
| Land and plants | Surface heat (day) | MODIS Terra monthly land surface temperature (MOD11C3), ~5 km | 2000– |
| Land and plants | Night heat | MODIS Terra monthly night-time land surface temperature (MOD11C3), ~5 km | 2000– |
| Land and plants | Evaporation | MERRA-2 evaporation from land, ~50 km | 1980– |
| Land and plants | Sunlight at ground | MERRA-2 sunlight reaching the land, ~50 km | 1980– |
| Water and snow | Rainfall | MERRA-2 bias-corrected precipitation, ~50 km | 1980– |
| Water and snow | Soil moisture (root zone) | MERRA-2 root-zone soil water, ~50 km | 1980– |
| Water and snow | Topsoil moisture (top 10 cm) | GLDAS Noah soil moisture, ~25 km | 2000– |
| Water and snow | Water storage (including groundwater) | GRACE and GRACE-FO, ~300 km | 2002–2022, with a gap in 2017–2018 |
| Water and snow | Open water (area of lakes, seas and reservoirs, in km²) | Read from MODIS Terra and Aqua monthly NDVI (MOD13A3, MYD13A3), ~1 km, with MODIS snow cover (MOD10CM) | 2002– |
| Water and snow | Snow cover | MODIS Terra monthly snow cover (MOD10CM), ~5 km | 2000– |
| Water and snow | Snow water | AMSR2 snow water equivalent, ~25 km | 2012–2025 |
| Water and snow | Snowfall | MERRA-2 snowfall, ~50 km | 1980– |
| Weather and upper air | Air temperature (2 m) | MERRA-2 2-metre air temperature, ~50 km | 1980– |
| Weather and upper air | Humidity | AIRS (Aqua) daytime relative humidity near the surface, ~100 km | 2002– |
| Weather and upper air | Water vapour | MERRA-2 total water vapour, ~50 km | 1980– |
| Weather and upper air | Wind | MERRA-2 wind speed near the surface, ~50 km | 1980– |
| Weather and upper air | Upper air (~10 km) | MERRA-2 air temperature at 250 hPa | 1980– |
| Weather and upper air | Heat leaving for space | AIRS (Aqua) daytime outgoing longwave radiation, ~100 km | 2002– |
| Weather and upper air | Ozone layer (~20 km) | MERRA-2 ozone at 50 hPa | 1980– |
| Gases and dust | Dust | MERRA-2 dust surface concentration, ~50 km | 1980– |
| Gases and dust | Fine dust (PM2.5) | MERRA-2 fine dust surface concentration, ~50 km | 1980– |
| Gases and dust | Haze (AOD) | MERRA-2 aerosol optical thickness at 550 nm, ~50 km | 1980– |
| Gases and dust | Sulphur dioxide | MERRA-2 SO₂ column, ~50 km | 1980– |
| Gases and dust | Carbon monoxide (~5 km up) | AIRS (Aqua) CO at 500 hPa, ~100 km | 2002– |
| Gases and dust | CO near the ground | MOPITT (Terra) daytime surface CO, ~100 km | 2000–2024 |
| Gases and dust | Methane (~7 km up) | AIRS (Aqua) methane at 400 hPa, ~100 km | 2002– |
| Sea | Sea temperature | MODIS Terra night-time sea surface temperature, ~4 km | 2000– |
| Sea | Sea salinity | SMAP sea surface salinity, ~70 km | 2015–, with gaps |

The Analysis page reads air temperature, rainfall, soil wetness, humidity, wind and sunshine from NASA POWER, which gives all six in seconds, with 2001–2020 normals. POWER answers for spots about 50 km across, so an area gets more of them as it grows (1, 3, 5, 9, then 16 above 1 million km²), spread over it and averaged; each measure's notes say so, and for big areas that the Trends page reads them from NASA's maps over the whole area. The two snow maps draw "no snow" see-through, as they do night, cloud, sea, lakes and missing data; NASA's rendered map images flatten all of those alike, so these two are read from NASA's map tiles instead, which name each pixel's entry in the colour key: no snow counts as 0, and what the satellite couldn't see is left out. Land cover comes from MODIS yearly land cover type (IGBP classes, 2001–2024). Every layer, matrix set and colour scale was checked against NASA GIBS capabilities, and one real month of each new measure decoded over test areas, in November 2026.

**Examples measured with the app (14 November 2026), the same results the home page tells as a story:**
- Mediterranean Sea, night-time sea surface temperature 2003–2025: **+0.61 °C per decade**, 95% range +0.21 to +1.45, p = 0.024. The sea's warmth carries over from year to year (lag-1 autocorrelation 0.57), so the test allows for it; without that it would read p < 0.001.
- Ozone at 50 hPa over Antarctica since 2005: a small rise (+0.009 ppm a year, p = 0.048), consistent with early signs of ozone-layer recovery.
- Uzbekistan growing-season NDVI since 2000: **no clear trend** for the country as a whole (p = 0.80), while the top decline with a clear trend lies on the Amu Darya delta by the dried-up Aral Sea (Bozatau District: −0.0040 NDVI a year, 95% range −0.0050 to −0.0029, 877 km²), **beyond chance**: with the years shuffled 19 times, no patch came out as strong.
- Open water, June–August, 2003–2026 (measured 15 November 2026): the **Aral Sea** fell from 21,970 km² to 5,020 km², **−690 km² a year** (95% range −918 to −458, p < 0.001), and the place it left most is the Muynoq district shore (14,950 km² that lost water, beyond chance). Checked on 14 lakes: Lake Urmia, the Great Salt Lake, Lake Mead, Aydar Lake and the Dead Sea shrink; Qinghai Lake grows (+13 km² a year); Lake Balkhash, Sarygamysh Lake, Lake Chad, Lake Victoria and Lake Tanganyika show no clear trend; Lake Poopó dried out in 2016 and 2021 and refilled.

## How the trend detective works

1. **Your choices.** The form asks for the measures (each with its own direction: decline, increase or both), the place, the years and the months. The choices are the page address, so every search is a shareable link, and a sentence at the top says them in words.
2. **Reading NASA's maps.** For each month, a WMS image of the area is requested from NASA GIBS on a grid no finer than the product (at most 200 px on the long side) and turned back into physical values pixel by pixel using NASA's published colour scale. At most 180 monthly maps are read per measure (120 when scanning three or more); longer periods use evenly spread years, and the notes say so. Maps are cached on the device (IndexedDB) and requests are de-duplicated, cancelled when stale and limited to 6 at a time. One map a year (the middle month of the season) is read first, so a provisional answer, labelled as one, shows within seconds.
3. **Per-pixel trends.** Each pixel's chosen months become one value per year: the mean of the months measured, with at least half of them required. When months are missing, each month measured counts by how far it was from that pixel's own usual value for the month, so a year that missed its greenest month doesn't look less green. The change is the recent window minus the baseline window. The trend test is Mann–Kendall with Sen's slope. On the Analysis page, a year missing a month is adjusted using that month's own long-run mean. **Open water** is the exception: each pixel is water (100) or land (0), and a year counts it as water when either satellite saw water there in any month of the season (see the limits for why), but can't count it as dry if it missed a month in which that pixel is usually wet (ice that year), so the whole area's and each patch's yearly values add up to km² of water. A shore that dries out does so once, as a step, which has no rate (Sen's slope is 0) and which the carry-over allowance would read as a run of similar years, so for each open-water pixel the test is Mann–Kendall without that allowance, and the map shows then against now. The whole area's trend keeps the allowance, and patches still face the chance check.
4. **Hotspots.** Pixels that changed by at least the chosen amount, with their own trend pointing the same way and clear once every pixel tested is allowed for (Benjamini–Hochberg, 5% false discovery rate), are grouped into 8-connected patches. A pixel that clouds or gaps left with too few years to test (under 60% of them) never counts. Patches are ranked by area × size of change, and very large areas are re-read finer for the top hotspots. Each patch is drawn as one outline (pixels touching at a corner stay joined), and named and numbered at a pixel inside it. The filters (direction, smallest change, smallest area) regroup the pixels already read, without new maps. **"Also show weaker patches"** lowers the bar to p < 0.1 for each pixel, and says that some of those may be chance.
5. **The chance check.** Once results are shown, the years are put in 19 different orders (the same orders every time) and every pixel is tested again with the same rules. That keeps clouds, gaps, the ups and downs between years and neighbouring pixels sharing the same weather, but takes away any real trend, so whatever passes there is chance. A patch stronger than the strongest chance patch in every shuffle is "beyond chance" (a cluster-level permutation test, p < 0.05); otherwise it "could be chance". A patch's own yearly test is shown only as its rate and 95% range, not as proof: it was picked because it changed, so it would look significant almost every time. Tested on real scans: with the years shuffled, clear trends found no patches in 40 of 40 shuffles (Uzbekistan vegetation and monsoon Bangladesh surface heat), while Uzbekistan's real changes still came out.
6. **The whole area and each hotspot.** An area-weighted yearly series gets a Mann–Kendall test, Sen's slope and its 95% range (Gilbert 1987), and a plain-language verdict. When the years are clearly correlated with the year before (lag-1 autocorrelation of the detrended series above 1.96/√n), the test's variance and the range are widened by the Yue and Wang (2004) factor, and the verdict says so. A trend that isn't clear comes with roughly how many years of record would show one of its size. **Changes of direction:** a single trend test reads a rise followed by an equal fall as "no clear trend", so every year from the 6th to the 6th from last is tried as the turning year, each stretch is tested with Mann–Kendall, and the turn counts when both stretches are clear (|z| ≥ 1.96) in opposite directions and the turn beats 999 copies of the record made from the same straight line with the ups and downs shuffled (p < 0.05, so trying every year can't make chance pass for a turn; the shuffles are seeded, so the same data always gives the same answer). The verdict then says when it turned and how fast it rose and fell, the chart draws the two stretches, and a longer record isn't offered. When the whole record does show a clear trend but turned partway, one sentence says so. Records under 11 years aren't checked. The same seeded shuffles test **two turns** (up, down, up again, in records of 16 years or more), a **change of pace** (faster, slower, a start after years of nothing, or levelling off: the two stretches' slopes differ by at least 1.96 standard errors), and a **sudden jump** (two flat levels fitting at least twice as well as a line, with Welch's t-test multiplied by the number of years tried). A jump is looked for even when the steady-trend test finds nothing, because two flat levels read to it as years that follow the year before. Each is named in the answer ("Not steadily. It jumped up between 2015 and 2016."), explained, and drawn in its stretches or levels.
7. **Possible causes.** Only on request, and only for a clear change. Five checks, all on NASA data, then fixed written rules (no AI) turn them into causes with their evidence:
   - *The weather* (NASA POWER at the same points as the climate): a small model learns how the measure follows two kinds of weather from year to year (rain over the 12 months up to each season and temperature for plants; temperature and soil wetness for ground heat; and so on). It learns from the ups and downs alone (each series with its straight-line drift taken out), so two things that drift over the years for different reasons (greener fields from irrigation, warmer air) can't look linked. It is scored on years it didn't learn from, then the link it learned is applied to the weather's own trend, to ask how much of the measure's trend the weather accounts for and whether a clear trend is left once the weather is taken out. This is the residual-trend method used to tell climate from human causes in vegetation studies.
   - *Sudden or gradual*: every split year is tried; a jump counts when two flat levels fit at least twice as well as a straight line and differ clearly (Welch's t-test, with the cut-off divided by the number of years tried).
   - *Fires* (MODIS fire detections, only after a sudden drop in plants or rise in ground heat): one day in eight, then every day around any fire found, in the time of the jump and the same length of time before.
   - *People* (NASA SEDAC population estimates, 2000–2020 every five years): the change over the years.
   - *What the land was* (MODIS land cover, the year before a jump or the first year): which human causes would fit, said as possibilities only.
8. **Checked against the ground.** For air temperature and rainfall on the Analysis page, NOAA's station search finds weather stations within 75 km, and their monthly summaries (GSOM) are read. Each station month becomes a departure from its own calendar-month average, so a year missing a few months still counts (at least half the months are needed), and the station's trend over the years both records share is compared with NASA's over the same years.
9. **Analysis page.** For any place, once **Start the analysis** is pressed (choosing a place only shows what will be read and how long it takes; a run can be stopped, and a report for earlier choices stays faded until the new choices are started): the answer in one sentence, written from the tests alone, then one line per measure with its verdict, rate, 95% range, p-value and yearly values (or then-vs-now with Welch's t-test, which counts fewer independent years when the years clearly follow the year before, as the trend test does). Each line opens to its explanation and charts. Climate results arrive in seconds and the maps fill in after them, one measure at a time. The latest 12 months are compared with the 2001–2020 normal separately, as they say nothing about a trend. The CSV includes the test results. With five or more measures tested, every clear result is also held to a 5% false discovery rate across all of them: one that doesn't hold up is marked "could be chance", and the summary says how many held up. Area averages weight each pixel by the ground it covers (pixels on a latitude/longitude map shrink towards the poles), and a month counts only when at least 30% of the area was seen. The quick answer grades the evidence ("strong evidence", "good evidence", "only just enough"), never the size of the change. All 30 measures can be chosen one by one: the six climate measures (air temperature, rainfall, soil moisture, humidity, wind, sunshine) come from one NASA POWER request, so switching one on or off just shows or hides it.

## Honest limits

- Values are decoded from the colour bins of NASA's map images, so their precision is that of the colour scale. When at least 5% of readings sit at either end of a scale (e.g. SO₂ over very polluted regions, water storage over a melting ice sheet, calm winds below 2 m/s), the results say that real values and changes there may be larger.
- MERRA-2 is a reanalysis: a NASA model constrained by observations, at about 50 km. The MODIS products have cloud gaps, which are left as gaps. Sea temperature is night-time only, SO₂ is the whole air column, methane is about 7 km up (it shows the global rise more than local sources), and fine dust counts dust only, not smoke or soot. Water storage blurs about 300 km and has gaps, so it can't show one small basin. Snow water can read too low under deep snow and in forests.
- Mann–Kendall assumes years are independent. The whole area and every hotspot are corrected for carry-over from one year to the next, and every pixel too, but with 10–25 years the correction is itself uncertain. Per-pixel tests are many tests at once, so pixels are held to a 5% false discovery rate, and the chance check tests the patches themselves. The chance check shuffles whole years, which removes carry-over from one year to the next as well as any trend, so for records with strong carry-over it can be a little generous. In always-cloudy places, many pixels can't be tested at all, so fewer changes can be found there. Choosing the years or months after seeing a result makes a chance result likelier, and the page says so when the choices change; the whole record is the fairest test. Hotspots are picked for changing most, so their rates lean high: the whole area's rate is the fairer figure. The bundled Atlas snow map was measured before snow was read from the tiles and is due to be measured again.
- A weather station measures one point and NASA's grid a square up to 50 km across, so they can differ honestly (a station in a city, or on a hill). Station records have gaps and some end years ago; the comparison uses only the years both have, and says which.
- The atlas is measured on a half-degree grid (about 50 km) and is a snapshot taken on the date it shows; a closer look on the Trends page reads NASA's maps afresh.
- Land cover is used one year at a time, to say what the land is (or was). NASA advises against measuring change by comparing its years: a single year's labels are too uncertain to tell real change from mix-ups between similar-looking land.
- Possible causes fit the evidence; they don't prove what happened. The weather check needs at least 8 years, and when the measure doesn't follow the weather closely it says it can't tell. Fires seen from space miss small and short fires. Population figures are estimates from censuses read from the map's colour bands, so the totals are rough (the change is the useful part) and they stop at 2020. Grazing, irrigation, farming choices, water use, dams and policy aren't measured, and the app says so.
- Several tests at once: about 1 test in 20 on an unchanging measure looks significant by chance. The Analysis page says so when a result is close to the cut-off.
- Continents follow the UN's list of world regions, with a few choices made plain where the continent is picked. Europe and Asia meet at the Ural Mountains, the Ural River, the Caspian Sea, the Caucasus and the Bosporus, so Russia, Kazakhstan and Turkey are cut along that line; the line is drawn by hand from known places along it, to within about 20 km. Georgia, Armenia, Azerbaijan and Cyprus count as Asia. Lands overseas go with the continent they are on (French Guiana with South America, Réunion with Africa). Land across the 180° line from the rest of its continent (Chukotka's tip, the last Aleutian islands, Polynesia east of 180°) and a few remote islands (Easter Island, Saint Helena, the islands near Antarctica) are left out, because a scan can't wrap around the globe and would otherwise stretch over empty ocean.
- Open water is read from the vegetation maps, where NASA's map service draws NDVI at or below zero as see-through, and open water is always below zero. Each monthly map keeps the greenest view of the month, so over water a hazy, cloudy or glinting view wins over a clear one and the water reads as land; read from one satellite month by month, steady lakes (Issyk-Kul, Lake Victoria) seemed to shrink and growing Qinghai Lake seemed to fall. So both Terra's and Aqua's maps are read (two chances a month to be seen clear, which is why the record starts in July 2002, with Aqua), and a year counts a pixel as water when either saw water there in any month of the season; checked on those lakes, their areas then held steady, and Qinghai's grew. Snow and ice are see-through too, so a pixel NASA's snow map shows as snowy is left out that month, a year needs 95% of the area read to count, and each lake is read by default in its clearest months: summer outside the tropics, the dry season inside them. Green, algae-rich or muddy water can still read as land, so for some lakes the area is too small; the result says so when much of the water comes and goes within a season. The snow map also mistakes salt flats and salty or muddy water for snow, even in summer, so its snow only counts where NASA's surface temperature map says the ground was below 5 °C. On a lake that hardly changes, a slow drift can remain: Issyk-Kul read −6 km² a year (2% over 23 years), more than its level suggests, so a small trend on a big lake should be read with care. Pixels are about 1 km, so ponds, narrow rivers and canyon reservoirs (Lake Mead) are missed in part. It measures a lake's area, not its depth or volume.
- Not measured: sea level, lake and river levels (heights; lake area is measured), river flow, burned area, NO₂ and ground-level ozone, because NASA has no suitable monthly map of them. CO₂ is left out on purpose: NASA's monthly maps stop at 390 ppm at the bottom of their scale, where most 2010 readings sit, so a trend would be false. Sea and ocean outlines are TerraScope's own (built from Natural Earth land outlines), not official boundaries.

## Getting started

```sh
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:8080`).

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript check of the app |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:e2e` | Build the app and test it in Chrome, at desktop and phone size (outside services switched off) |
| `npm run test:watch` | Vitest in watch mode |

## Environment variables (all optional)

Copy `.env.example` to `.env`.

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Backend for accounts. Accounts are switched off for now (`ACCOUNTS_ENABLED` in `src/config.ts`), so every page is open. |
| `VITE_AI_ANALYSIS_ENDPOINT` | Your own endpoint for an optional AI-written briefing on the Analysis page. Everything works without it. |

Never put secrets (model API keys and the like) in `VITE_` variables: they end up in the browser bundle.

## Data sources

| Data | Source |
| --- | --- |
| Monthly maps, land cover, colour scales, time domains | [NASA EOSDIS GIBS](https://www.earthdata.nasa.gov/gibs): MODIS, MERRA-2, AIRS, MOPITT, GLDAS, GRACE, AMSR2, SMAP |
| Climate at points | [NASA POWER](https://power.larc.nasa.gov/) monthly and climatology API |
| Weather stations (ground check) | [NOAA NCEI](https://www.ncei.noaa.gov/access/services/) Global Summary of the Month (GSOM), through its free search and data services |
| Fires and people (possible causes) | MODIS fire detections (Terra and Aqua) and NASA SEDAC Gridded Population of the World v4, both through NASA GIBS |
| Place search, boundaries | [OpenStreetMap](https://www.openstreetmap.org/copyright) via [Photon](https://photon.komoot.io/) and [Nominatim](https://nominatim.org/) (queued to one request a second) |
| Country outlines and coastlines | [Natural Earth](https://www.naturalearthdata.com/) 1:50m (bundled in `public/data`; also used to cut the land out of the sea and ocean areas) |
| Globe textures | NASA GIBS Blue Marble (surface, plus a sharper piece of Central Asia, about 1 km a pixel, fetched once a visitor scrolls towards Uzbekistan, with the Aral Sea from a cloud-free MODIS Terra picture of 18 August 2025, so it shows today's dried-up sea); NASA Blue Marble cloud map (clouds) |
| Home page findings | Measured with the app's own scanner; `scripts/measure-findings.browser.js` says how to measure them again |
| World change atlas | Measured with the app's own scanner; `scripts/measure-atlas.browser.js` says how to measure it again |
| Fonts | Inter, Instrument Serif and JetBrains Mono, bundled with the app (no font service is contacted) |

## Project structure

```
src/
├── pages/            # Landing, Trends, Atlas, Analysis, Explore, Split, Sync, 404
├── components/
│   ├── landing/      # The home page: planet shaders, the camera's stops, the measured findings
│   ├── trends/       # Form, area picker, land cover card, tabs, filters, whole-area and hotspot cards
│   ├── analysis/     # Location picker, period/months/dataset controls, charts, the line-per-measure scoreboard, report panels
│   ├── causes/       # The “What may be behind it” section
│   ├── demo/         # The guided demo player
│   ├── common/       # Month picker, glossary
│   ├── map/          # Base map, GIBS layers, drawing, legends, place names, grid and readout
│   └── search/       # Navbar search and the Ctrl/⌘K palette
├── lib/
│   ├── query/        # Measures and period planning
│   ├── trends/       # Monthly grids, land/sea masks, per-pixel trends, hotspots, scans, land cover, URL state
│   ├── analysis/     # Analysis engine, statistics (Mann–Kendall, Sen, carry-over, false discovery rate, Welch), trend tests, insights, CSV, printing
│   ├── stations/     # Weather stations near a place (NOAA) and the ground check
│   ├── atlas/        # The world change atlas and its measured data
│   ├── causes/       # Possible causes: the weather model, sudden or gradual, fires, people, the rules and wording
│   ├── gibs/         # Layer catalog, time domains, colour-scale decoding, area sampling
│   ├── geo/          # Geometry, geocoding, country outlines, continents, seas and named regions, cutting shapes, link-safe outlines, combined shapes
│   ├── areas/        # Places added together: how links carry them, loading their outlines
│   ├── map/          # Which names and grid lines a map shows at each zoom
│   ├── demo/         # Demo scripts
│   └── glossary.ts   # Plain definitions of measures and statistics words
└── hooks/            # Trend scans, land cover, analysis runs, possible causes, frames
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

## Tests

```sh
npm run typecheck && npm run lint && npm test
npm run test:e2e   # the first time: npm install, then this uses the Chrome already on the computer
```

The Vitest suite covers:
- choices ⇄ page address round trips
- seas and oceans: 54 clicks land in the right water, all open water is covered, the bundled water areas leave out land and enclosed seas
- place search and named regions: what each found place is, the exact name first, short country names, degrees and minutes, repeats left out, countries read from their land outline, a typed city taken as the city and not its province, NASA layers first for their own names
- continents from real data: European Russia comes out at the usual 3.95 million km², cities fall on the right side of the Urals and the Bosporus, overseas lands go to their own continent, no land is counted in two continents, and no continent wraps around the 180° line; cutting shapes (including a corner exactly on the line and a hole across it)
- places added together: links that keep every place, shared land counted once, overlapping parts read once, climate read in every place
- statistics against textbook values (Mann–Kendall, Sen's slope and its range, Welch's t-test), the carry-over correction (a slow swing that fools the plain test, a real trend that survives it), the false discovery rate and years-to-detect
- the ground check: reading NOAA's station search and monthly summaries, station years from months with gaps, agreement and disagreement on made-up records
- the first look: which months are read first, and the provisional answer
- the world change atlas: every measure's map is there at the size of its grid, its changes have readable outlines and tested trends, and each opens the right Trends search
- printing: the report prints on white paper and the page's colours come back after
- yearly aggregation and period comparison
- per-pixel trends, hotspot clustering and whole-area summaries on synthetic grids
- land/sea/air masks and the end-of-scale notes
- every measure wired up from layer to definition, and products with uneven dates or records that end early
- colour-scale decoding and unit conversions
- land cover grouping and suggestions
- possible causes on made-up records with a known answer: greenness built from rain (drier years), a trend the weather doesn't explain, no link at all, a sudden drop with fires (including a fire of only two or three weeks), a jump in the last two years of a record, the wording and its limits, and that one failed NASA service leaves the other checks standing
- the scan hook
- the Analysis page (nothing read until Start is pressed, the report kept faded when the choices change, Stop, the answer from the tests alone, results as they arrive, compare mode, picked months, big requests)
- the Trends page (a link opens with its search filled in and scans nothing until Find changes)
- the demo player
- the home page: the camera's path, and that its words still agree with the measured findings
- plain-language checks on every definition

The Playwright tests (`e2e/`) open the built app in Chrome at desktop and phone size: the home page leads to every tool, the Trends page reads a search from its address, the atlas switches measures and opens a change on the Trends page, and a missing page says so. NASA and the other outside services are switched off in them, so they test TerraScope itself.

## Deploying

`netlify.toml` builds with `npm run build`, publishes `dist/` and sends every route to `index.html`, so deep links like `/trends?ind=sst&place=Mediterranean+Sea` work. It also sets safe browser headers and caches the globe pictures and bundled data. A shared link shows a preview picture once the site's address is known: Netlify provides it as `URL`, or set `VITE_SITE_URL`. You can import the repository at [app.netlify.com/start](https://app.netlify.com/start), or run `netlify deploy --prod --dir dist`.
