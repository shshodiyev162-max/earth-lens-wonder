// Real results, measured by this app's own scanner (runScan in lib/trends/scan.ts) from NASA's monthly
// maps, the same way the Trends page does when each finding's `link` is opened. Not edited by hand.
// The per-pixel maps are in public/data/findings: red = rate per decade (0-255 maps to
// -scalePerDecade..+scalePerDecade), green = significant at p < 0.05, blue = measured.

export const MEASURED = {
  "measuredOn": "2026-11-09",
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
        "p": 4.95e-05,
        "slopePerYear": 0.0614,
        "lowerPerYear": 0.0434,
        "upperPerYear": 0.0928,
        "slopePerDecade": 0.6135,
        "years": 23,
        "method": "Mann–Kendall + Sen's slope"
      },
      "hotspot": {
        "name": null,
        "center": [
          36.797,
          16.786
        ],
        "bbox": [
          -5.536,
          30.162,
          36.136,
          45.638
        ],
        "areaKm2": 2316352,
        "meanChange": 1.2577,
        "series": [
          {
            "year": 2003,
            "value": 20.2102
          },
          {
            "year": 2004,
            "value": 19.7447
          },
          {
            "year": 2005,
            "value": 19.6963
          },
          {
            "year": 2006,
            "value": 19.867
          },
          {
            "year": 2007,
            "value": 19.986
          },
          {
            "year": 2009,
            "value": 19.9864
          },
          {
            "year": 2011,
            "value": 20.1135
          },
          {
            "year": 2014,
            "value": 20.3569
          },
          {
            "year": 2017,
            "value": 20.3439
          },
          {
            "year": 2019,
            "value": 20.3341
          },
          {
            "year": 2021,
            "value": 20.5012
          },
          {
            "year": 2022,
            "value": 20.7105
          },
          {
            "year": 2023,
            "value": 21.285
          },
          {
            "year": 2024,
            "value": 21.6831
          },
          {
            "year": 2025,
            "value": 21.613
          }
        ],
        "verdict": {
          "label": "Significant increase",
          "direction": "increase",
          "p": 4.95e-05,
          "slopePerYear": 0.0612,
          "lowerPerYear": 0.0434,
          "upperPerYear": 0.0928,
          "slopePerDecade": 0.6122,
          "years": 23,
          "method": "Mann–Kendall + Sen's slope"
        }
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
        "significantShare": 0.997,
        "rising": 1.0,
        "significantRising": 0.9974,
        "significantFalling": 0.0
      },
      "measuredOn": "2026-11-09"
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
        "method": "Mann–Kendall + Sen's slope"
      },
      "hotspot": {
        "name": "Muynoq district, Uzbekistan",
        "center": [
          43.487,
          59.22
        ],
        "bbox": [
          58.443,
          42.868,
          60.266,
          44.265
        ],
        "areaKm2": 4633,
        "meanChange": -0.099,
        "series": [
          {
            "year": 2000,
            "value": 0.26806
          },
          {
            "year": 2001,
            "value": 0.20548
          },
          {
            "year": 2002,
            "value": 0.26157
          },
          {
            "year": 2003,
            "value": 0.29036
          },
          {
            "year": 2004,
            "value": 0.30613
          },
          {
            "year": 2005,
            "value": 0.28291
          },
          {
            "year": 2006,
            "value": 0.27778
          },
          {
            "year": 2007,
            "value": 0.2441
          },
          {
            "year": 2008,
            "value": 0.2136
          },
          {
            "year": 2009,
            "value": 0.17126
          },
          {
            "year": 2010,
            "value": 0.23821
          },
          {
            "year": 2011,
            "value": 0.24161
          },
          {
            "year": 2012,
            "value": 0.22619
          },
          {
            "year": 2013,
            "value": 0.24921
          },
          {
            "year": 2014,
            "value": 0.19918
          },
          {
            "year": 2015,
            "value": 0.21882
          },
          {
            "year": 2016,
            "value": 0.25623
          },
          {
            "year": 2017,
            "value": 0.23667
          },
          {
            "year": 2018,
            "value": 0.22452
          },
          {
            "year": 2019,
            "value": 0.19678
          },
          {
            "year": 2020,
            "value": 0.20195
          },
          {
            "year": 2021,
            "value": 0.16768
          },
          {
            "year": 2022,
            "value": 0.15633
          },
          {
            "year": 2023,
            "value": 0.14481
          },
          {
            "year": 2024,
            "value": 0.16982
          },
          {
            "year": 2025,
            "value": 0.16251
          },
          {
            "year": 2026,
            "value": 0.19058
          }
        ],
        "verdict": {
          "label": "Significant decline",
          "direction": "decline",
          "p": 2.54e-05,
          "slopePerYear": -0.0044,
          "lowerPerYear": -0.00601,
          "upperPerYear": -0.00298,
          "slopePerDecade": -0.04397,
          "years": 27,
          "method": "Mann–Kendall + Sen's slope"
        }
      },
      "hotspotCount": 10,
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
        "scalePerDecade": 0.04559,
        "measuredPixels": 4135,
        "significantShare": 0.22,
        "rising": 0.4155,
        "significantRising": 0.1337,
        "significantFalling": 0.0861,
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
      },
      "measuredOn": "2026-11-09"
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
        "method": "Mann–Kendall + Sen's slope"
      },
      "hotspot": {
        "name": null,
        "center": [
          -78.723,
          32.619
        ],
        "bbox": [
          -176.4,
          -89.999,
          176.4,
          -67.891
        ],
        "areaKm2": 7606014,
        "meanChange": 0.1365,
        "series": [
          {
            "year": 2005,
            "value": 2.2089
          },
          {
            "year": 2006,
            "value": 2.1259
          },
          {
            "year": 2007,
            "value": 2.2295
          },
          {
            "year": 2008,
            "value": 2.2814
          },
          {
            "year": 2009,
            "value": 2.227
          },
          {
            "year": 2011,
            "value": 2.1869
          },
          {
            "year": 2013,
            "value": 2.3916
          },
          {
            "year": 2015,
            "value": 2.1192
          },
          {
            "year": 2017,
            "value": 2.4229
          },
          {
            "year": 2019,
            "value": 2.5855
          },
          {
            "year": 2021,
            "value": 2.2856
          },
          {
            "year": 2022,
            "value": 2.3188
          },
          {
            "year": 2023,
            "value": 2.3006
          },
          {
            "year": 2024,
            "value": 2.3316
          },
          {
            "year": 2025,
            "value": 2.5184
          }
        ],
        "verdict": {
          "label": "Significant increase",
          "direction": "increase",
          "p": 0.0175,
          "slopePerYear": 0.0106,
          "lowerPerYear": 0.004,
          "upperPerYear": 0.0236,
          "slopePerDecade": 0.1056,
          "years": 21,
          "method": "Mann–Kendall + Sen's slope"
        }
      },
      "hotspotCount": 1,
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
        "significantShare": 0.685,
        "rising": 0.9994,
        "significantRising": 0.6846,
        "significantFalling": 0
      },
      "measuredOn": "2026-11-09"
    }
  }
} as const;
