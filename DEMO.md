# Presenting TerraScope in 3 minutes

A script for showing TerraScope to an audience. Everything uses live NASA data.

## Before you start (5 minutes, once)

NASA's map service can take a minute or two to answer the first time; after that the maps are kept in the browser. Open each of these once on the presenting computer, in the same browser, and wait for the results:

1. `/trends?ind=vegetation&dir=decline&country=UZB&name=Uzbekistan&t=since-2015`
2. `/trends?ind=sst&dir=increase&place=Mediterranean+Sea&t=since-2003`
3. `/analysis?country=UZB&name=Uzbekistan&period=compare&base=2001-2010&recent=2016-2025&season=m-4.5.6.7.8.9&ds=vegetation,climate`

The built-in demos then play smoothly too: home page → **Watch a demo**, or `/trends?demo=choose`.

## The script

**0:00 – The question (home page)**
> "What is changing on Earth, where, by how much — and is it significant? TerraScope answers with NASA data only."

If there's time, scroll: the planet flies to three measured results (yes, no and barely), then press **Find changes**. Otherwise press it straight away.

**0:15 – Choose (Trends)**
> "Four choices, one after another: what to measure, where, when, and which months."

Press **Country or sea** and click Uzbekistan on the map. Pick **Vegetation** and choose *Since a year… 2015*. Point at the line at the top that says the choices in words. Mention the 29 measures (land, water and snow, air, gases, sea) and **Suggested for this place**, which picks measures from NASA's land cover map. Press **Find changes**.

**0:45 – Is it significant? (the whole area)**
> "One NASA map per month, every pixel tested. For Uzbekistan as a whole: no clear trend — the 95% range includes zero. TerraScope says so instead of overstating it, and offers to test the whole record since 2000."

**1:10 – Where? (hotspots)**
> "But some places changed a lot. The top hotspot is on the dried-up Aral Sea shore: a significant decline, with its rate and 95% range."

Set **Show** to *Declines* and click hotspot 1. Then switch **Show** to *Both*:
> "Filters regroup the pixels already read — no new downloads."

**1:40 – Then vs now (Analysis)**
Open preset 3 (or press **Open full analysis** on the whole-area card and choose *Compare two periods*):
> "For any place: the answer in one sentence, then one line per measure with its verdict and rate. Here it's a then-versus-now comparison, with Welch's t-test on the yearly averages. Open a line for its charts and explanation."

Scroll to **Checked against the ground** (for a city such as Tashkent or Paris):
> "NASA's air temperature is checked against the nearest NOAA weather station, over the years both have. Here the two trends agree. Where they don't, or there's no station, it says so."

**Save as PDF** prints the report on white paper.

**2:10 – Beyond land (sea and ozone)**
Back on Trends, press **Country or sea** and click the Mediterranean — the whole sea lights up, not a dot. (Searching for "Mediterranean" at the top, or choosing it from **Or choose a known region, sea or ocean**, does the same.) Pick **Sea temperature**, *since 2003*, and find changes:
> "Only the water is scanned. About +0.6 °C per decade, and the range stays above zero even after allowing for the sea's warmth carrying over from one year to the next: significant warming."

Optionally: the ozone layer over Antarctica since 2005.

**2:25 – The whole world (Atlas)**
Open **Atlas** in the navigation bar:
> "The same tests, run over the whole world for six measures, every month since 2003. Each list shows where a measure changed most. Pick one and press *Look closer* to open it on the Trends page."

**2:40 – Honesty and learning**
Open **Words used here**:
> "Every statistics word is explained in plain language. And if a measure doesn't fit the place — vegetation over a sea — TerraScope says so before reading a single map."

**3:00 – Close**
> "Twenty-nine NASA measures, any place on Earth — countries, seas, or a shape you draw — real significance tests, and honest answers, in the browser, with no keys and no simulated numbers."

## If something goes wrong

- **Slow first answer:** NASA's map service is busy. Show the progress bar ("Reading NASA maps: 40 of 66") and move on to a pre-warmed example.
- **"NASA GIBS didn't answer":** press **Try again**; requests are retried automatically.
- **No internet:** TerraScope needs NASA's live services. Use the pre-warmed tabs (cached results still open) or screenshots. The Atlas's change maps and lists are bundled, so they still show (without the satellite picture underneath).
