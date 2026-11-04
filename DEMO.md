# Presenting TerraScope in 3 minutes

A script for showing TerraScope to judges or a class. Everything uses live NASA data.

## Before you start (5 minutes, once)

NASA's map service can take a minute or two to answer the first time; after that the maps are kept in the browser. Run each of these once on the presenting computer, in the same browser, and wait for the results:

1. `/trends?q=where did vegetation decline in Uzbekistan since 2015`
2. `/trends?q=is the Mediterranean sea temperature rising since 2003`
3. `/analysis?country=UZB&name=Uzbekistan&period=compare&base=2001-2010&recent=2016-2025&season=m-4.5.6.7.8.9&ds=vegetation,climate`

The built-in demos then play smoothly too: home page → **Watch a demo**, or `/trends?demo=choose`.

## The script

**0:00 – The question (home page)**
> "The challenge asks: what is changing on Earth, where, by how much — and is it significant? TerraScope answers with NASA data only."

Type *where did vegetation decline in Uzbekistan since 2015* into the search box under the globe and press Enter.

**0:20 – From words to choices (Trends)**
> "The question becomes choices you can see: vegetation from NASA's MODIS satellites, Uzbekistan, 2015 to now, the growing season. Change any of them and the sentence is rewritten."

Point at the form. Mention the 13 measures (land, air, sea, ozone layer) and **Suggested for this place**, which picks measures from NASA's land cover map.

**0:45 – Is it significant? (the whole area)**
> "One NASA map per month, every pixel tested. For Uzbekistan as a whole: no clear trend — the 95% range includes zero. TerraScope says so instead of overstating it, and offers to test the whole record since 2000."

**1:10 – Where? (hotspots)**
> "But some places changed a lot. The top hotspot is on the dried-up Aral Sea shore: a significant decline, with its rate and 95% range."

Click hotspot 1. Then switch **Show** to *Both*:
> "Filters regroup the pixels instantly — no new downloads."

**1:40 – Then vs now (Analysis)**
Open preset 3 (or press **Open full analysis** on the whole-area card and choose *Compare two periods*):
> "For any place: every measure gets a trend test, or here a then-versus-now comparison with Welch's t-test on the yearly averages."

**2:10 – Beyond land (sea and ozone)**
Run *is the Mediterranean sea temperature rising since 2003*:
> "Only the sea is scanned. About +0.6 °C per decade, with a range well above zero: significant warming."

Optionally: *ozone layer recovery over Antarctica since 2005*.

**2:40 – Honesty and learning**
Open **Words used here**:
> "Every statistics word is explained in plain language. If something isn't measured — sea level, NO₂, river flow — TerraScope says so and offers the closest real measures."

**3:00 – Close**
> "Thirteen NASA measures, any place on Earth, real significance tests, and honest answers — in the browser, with no keys and no simulated numbers."

## If something goes wrong

- **Slow first answer:** NASA's map service is busy. Show the progress bar ("Reading NASA maps: 40 of 66") and move on to a pre-warmed example.
- **"NASA GIBS didn't answer":** press **Try again**; requests are retried automatically.
- **No internet:** TerraScope needs NASA's live services. Use the pre-warmed tabs (cached results still open) or screenshots.
