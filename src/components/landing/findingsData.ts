// Real results, measured by this app's own scanner (runScan in lib/trends/scan.ts) from NASA's monthly
// maps, the same way the Trends page does when each finding's `link` is opened. Not edited by hand.
// The per-pixel maps are in public/data/findings: red = rate per decade (0-255 maps to
// -scalePerDecade..+scalePerDecade), green = a clear trend (the hotspots' cut-off: allowing for year-to-year
// carry-over and for every pixel tested at once), blue = measured. A hotspot's `chance` is how many of
// `chanceRuns` shuffles of the years made a patch at least as strong (lib/trends/chance).

export const MEASURED = {
  "measuredOn": "2026-11-14",
  "findings": {
    "mediterranean": {
      "id": "mediterranean",
      "indicator": "sst",
      "label": "Sea temperature",
      "subject": "Sea surface temperature (night)",
      "unit": "°C",
      "product": "MODIS Terra monthly night-time sea surface temperature, ~4 km",
      "area": "Mediterranean Sea",
      "center": [
        37.103,
        16.719
      ],
      "link": "/trends?ind=sst&dir=increase&place=Mediterranean+Sea&t=since-2003",
      "startYear": 2003,
      "endYear": 2025,
      "yearsCount": 15,
      "months": "All months",
      "mapsRead": 175,
      "missingMonths": 5,
      "failedMonths": 0,
      "notes": [
        "15 of 23 years are read, to keep the scan quick.",
        "NASA has no sea temperature map for 5 of the requested months (gaps in the record)."
      ],
      "scannedKm2": 2321587,
      "validShare": 1,
      "meanChange": 1.2585,
      "baseline": [
        2003,
        2007
      ],
      "recent": [
        2021,
        2025
      ],
      "series": [
        {
          "year": 2003,
          "value": 20.201
        },
        {
          "year": 2004,
          "value": 19.737
        },
        {
          "year": 2005,
          "value": 19.689
        },
        {
          "year": 2006,
          "value": 19.8587
        },
        {
          "year": 2007,
          "value": 19.979
        },
        {
          "year": 2009,
          "value": 19.9793
        },
        {
          "year": 2011,
          "value": 20.1054
        },
        {
          "year": 2014,
          "value": 20.3505
        },
        {
          "year": 2017,
          "value": 20.3359
        },
        {
          "year": 2019,
          "value": 20.3278
        },
        {
          "year": 2021,
          "value": 20.4941
        },
        {
          "year": 2022,
          "value": 20.7025
        },
        {
          "year": 2023,
          "value": 21.2784
        },
        {
          "year": 2024,
          "value": 21.6769
        },
        {
          "year": 2025,
          "value": 21.6055
        }
      ],
      "verdict": {
        "label": "Significant increase",
        "direction": "increase",
        "p": 0.0236,
        "slopePerYear": 0.0614,
        "lowerPerYear": 0.0205,
        "upperPerYear": 0.145,
        "slopePerDecade": 0.6135,
        "years": 23,
        "method": "Mann–Kendall + Sen's slope",
        "carryOver": 0.57,
        "yearsNeeded": 24
      },
      "hotspot": {
        "name": null,
        "center": [
          36.851,
          16.751
        ],
        "bbox": [
          -5.536,
          30.162,
          36.136,
          45.638
        ],
        "areaKm2": 2265177,
        "meanChange": 1.2592,
        "series": [
          {
            "year": 2003,
            "value": 20.2019
          },
          {
            "year": 2004,
            "value": 19.7358
          },
          {
            "year": 2005,
            "value": 19.6878
          },
          {
            "year": 2006,
            "value": 19.854
          },
          {
            "year": 2007,
            "value": 19.9745
          },
          {
            "year": 2009,
            "value": 19.9799
          },
          {
            "year": 2011,
            "value": 20.111
          },
          {
            "year": 2014,
            "value": 20.3528
          },
          {
            "year": 2017,
            "value": 20.3405
          },
          {
            "year": 2019,
            "value": 20.3301
          },
          {
            "year": 2021,
            "value": 20.4952
          },
          {
            "year": 2022,
            "value": 20.7012
          },
          {
            "year": 2023,
            "value": 21.2749
          },
          {
            "year": 2024,
            "value": 21.675
          },
          {
            "year": 2025,
            "value": 21.6036
          }
        ],
        "verdict": {
          "label": "Significant increase",
          "direction": "increase",
          "p": 0.023,
          "slopePerYear": 0.0617,
          "lowerPerYear": 0.0204,
          "upperPerYear": 0.1433,
          "slopePerDecade": 0.617,
          "years": 23,
          "method": "Mann–Kendall + Sen's slope",
          "carryOver": 0.56,
          "yearsNeeded": 24
        },
        "chance": 0,
        "chanceRuns": 19
      },
      "hotspotCount": 2,
      "overlay": {
        "file": "mediterranean.png",
        "bbox": [
          -5.8,
          29.9,
          36.4,
          45.9
        ],
        "width": 160,
        "height": 61,
        "scalePerDecade": 0.8891,
        "measuredPixels": 3417,
        "significantShare": 0.978,
        "rising": 1,
        "significantRising": 0.9781,
        "significantFalling": 0
      }
    },
    "uzbekistan": {
      "id": "uzbekistan",
      "indicator": "vegetation",
      "label": "Vegetation",
      "subject": "Plant greenness (NDVI)",
      "unit": "NDVI",
      "product": "MODIS Terra monthly NDVI (MOD13A3), ~1 km",
      "area": "Uzbekistan",
      "center": [
        41.755,
        63.141
      ],
      "link": "/trends?ind=vegetation&dir=decline&country=UZB&name=Uzbekistan&t=since-2000",
      "startYear": 2000,
      "endYear": 2026,
      "yearsCount": 27,
      "months": "Apr–Sep",
      "mapsRead": 161,
      "missingMonths": 1,
      "failedMonths": 0,
      "notes": [
        "NASA has no vegetation map for 1 of the requested months (gaps in the record)."
      ],
      "scannedKm2": 445609,
      "validShare": 0.967,
      "meanChange": -0.00107,
      "baseline": [
        2000,
        2004
      ],
      "recent": [
        2022,
        2026
      ],
      "series": [
        {
          "year": 2000,
          "value": 0.16452
        },
        {
          "year": 2001,
          "value": 0.15965
        },
        {
          "year": 2002,
          "value": 0.20985
        },
        {
          "year": 2003,
          "value": 0.20876
        },
        {
          "year": 2004,
          "value": 0.19671
        },
        {
          "year": 2005,
          "value": 0.19329
        },
        {
          "year": 2006,
          "value": 0.18466
        },
        {
          "year": 2007,
          "value": 0.19331
        },
        {
          "year": 2008,
          "value": 0.16716
        },
        {
          "year": 2009,
          "value": 0.1949
        },
        {
          "year": 2010,
          "value": 0.19069
        },
        {
          "year": 2011,
          "value": 0.16724
        },
        {
          "year": 2012,
          "value": 0.18529
        },
        {
          "year": 2013,
          "value": 0.18809
        },
        {
          "year": 2014,
          "value": 0.17462
        },
        {
          "year": 2015,
          "value": 0.18922
        },
        {
          "year": 2016,
          "value": 0.19926
        },
        {
          "year": 2017,
          "value": 0.1967
        },
        {
          "year": 2018,
          "value": 0.17567
        },
        {
          "year": 2019,
          "value": 0.20313
        },
        {
          "year": 2020,
          "value": 0.19152
        },
        {
          "year": 2021,
          "value": 0.16823
        },
        {
          "year": 2022,
          "value": 0.18024
        },
        {
          "year": 2023,
          "value": 0.1675
        },
        {
          "year": 2024,
          "value": 0.1848
        },
        {
          "year": 2025,
          "value": 0.17447
        },
        {
          "year": 2026,
          "value": 0.21433
        }
      ],
      "verdict": {
        "label": "No clear trend",
        "direction": "none",
        "p": 0.802,
        "slopePerYear": -0.00028,
        "lowerPerYear": -0.00109,
        "upperPerYear": 0.00072,
        "slopePerDecade": -0.00276,
        "years": 27,
        "method": "Mann–Kendall + Sen's slope",
        "carryOver": null,
        "yearsNeeded": 74
      },
      "hotspot": {
        "name": "Bozatau District, Uzbekistan",
        "center": [
          43.37,
          59.442
        ],
        "bbox": [
          59.194,
          43.191,
          59.73,
          43.62
        ],
        "areaKm2": 877,
        "meanChange": -0.09369,
        "series": [
          {
            "year": 2000,
            "value": 0.23256
          },
          {
            "year": 2001,
            "value": 0.1935
          },
          {
            "year": 2002,
            "value": 0.25425
          },
          {
            "year": 2003,
            "value": 0.2169
          },
          {
            "year": 2004,
            "value": 0.23335
          },
          {
            "year": 2005,
            "value": 0.20343
          },
          {
            "year": 2006,
            "value": 0.2396
          },
          {
            "year": 2007,
            "value": 0.20274
          },
          {
            "year": 2008,
            "value": 0.1826
          },
          {
            "year": 2009,
            "value": 0.16641
          },
          {
            "year": 2010,
            "value": 0.17371
          },
          {
            "year": 2011,
            "value": 0.18582
          },
          {
            "year": 2012,
            "value": 0.19624
          },
          {
            "year": 2013,
            "value": 0.20366
          },
          {
            "year": 2014,
            "value": 0.16775
          },
          {
            "year": 2015,
            "value": 0.16693
          },
          {
            "year": 2016,
            "value": 0.19451
          },
          {
            "year": 2017,
            "value": 0.17286
          },
          {
            "year": 2018,
            "value": 0.16999
          },
          {
            "year": 2019,
            "value": 0.15264
          },
          {
            "year": 2020,
            "value": 0.14463
          },
          {
            "year": 2021,
            "value": 0.13686
          },
          {
            "year": 2022,
            "value": 0.1274
          },
          {
            "year": 2023,
            "value": 0.11951
          },
          {
            "year": 2024,
            "value": 0.14695
          },
          {
            "year": 2025,
            "value": 0.13264
          },
          {
            "year": 2026,
            "value": 0.16754
          }
        ],
        "verdict": {
          "label": "Significant decline",
          "direction": "decline",
          "p": 1.63e-06,
          "slopePerYear": -0.00396,
          "lowerPerYear": -0.005,
          "upperPerYear": -0.00294,
          "slopePerDecade": -0.03965,
          "years": 27,
          "method": "Mann–Kendall + Sen's slope",
          "carryOver": null,
          "yearsNeeded": 15
        },
        "chance": 0,
        "chanceRuns": 19
      },
      "hotspotCount": 6,
      "overlay": {
        "file": "uzbekistan.png",
        "bbox": [
          55.976,
          37.172,
          73.137,
          45.555
        ],
        "width": 160,
        "height": 78,
        "scalePerDecade": 0.0456,
        "measuredPixels": 4135,
        "significantShare": 0.11,
        "rising": 0.3787,
        "significantRising": 0.088,
        "significantFalling": 0.022,
        "picture": {
          "file": "uzbekistan-fine.png",
          "bbox": [
            55.976,
            37.172,
            73.137,
            45.555
          ],
          "width": 700,
          "height": 342
        }
      }
    },
    "antarctica": {
      "id": "antarctica",
      "indicator": "ozone",
      "label": "Ozone layer",
      "subject": "Ozone about 20 km up",
      "unit": "ppm",
      "product": "MERRA-2 monthly ozone at 50 hPa (about 20 km up), ~50 km",
      "area": "Antarctica",
      "center": [
        -80.509,
        19.921
      ],
      "link": "/trends?ind=ozone&dir=increase&place=Antarctica&t=since-2005",
      "startYear": 2005,
      "endYear": 2025,
      "yearsCount": 15,
      "months": "All months",
      "mapsRead": 180,
      "missingMonths": 0,
      "failedMonths": 0,
      "notes": [
        "15 of 21 years are read, to keep the scan quick."
      ],
      "scannedKm2": 12270528,
      "validShare": 0.993,
      "meanChange": 0.1141,
      "baseline": [
        2005,
        2009
      ],
      "recent": [
        2021,
        2025
      ],
      "series": [
        {
          "year": 2005,
          "value": 2.3153
        },
        {
          "year": 2006,
          "value": 2.2088
        },
        {
          "year": 2007,
          "value": 2.3131
        },
        {
          "year": 2008,
          "value": 2.3462
        },
        {
          "year": 2009,
          "value": 2.2809
        },
        {
          "year": 2011,
          "value": 2.2916
        },
        {
          "year": 2013,
          "value": 2.4689
        },
        {
          "year": 2015,
          "value": 2.1952
        },
        {
          "year": 2017,
          "value": 2.4868
        },
        {
          "year": 2019,
          "value": 2.6742
        },
        {
          "year": 2021,
          "value": 2.3379
        },
        {
          "year": 2022,
          "value": 2.3588
        },
        {
          "year": 2023,
          "value": 2.3279
        },
        {
          "year": 2024,
          "value": 2.4271
        },
        {
          "year": 2025,
          "value": 2.5829
        }
      ],
      "verdict": {
        "label": "Significant increase",
        "direction": "increase",
        "p": 0.0478,
        "slopePerYear": 0.0094,
        "lowerPerYear": 0.0007,
        "upperPerYear": 0.0234,
        "slopePerDecade": 0.0938,
        "years": 21,
        "method": "Mann–Kendall + Sen's slope",
        "carryOver": null,
        "yearsNeeded": 25
      },
      "hotspot": null,
      "hotspotCount": 0,
      "overlay": {
        "file": "antarctica.png",
        "bbox": [
          -180,
          -89.999,
          180,
          -60.521
        ],
        "width": 720,
        "height": 59,
        "scalePerDecade": 0.1361,
        "measuredPixels": 24175,
        "significantShare": 0,
        "rising": 0.9994,
        "significantRising": 0,
        "significantFalling": 0
      }
    }
  }
} as const;
