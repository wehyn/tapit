# Tapit real-device acceptance checklist

Complete this matrix with a production-like or isolated preview deployment. Do not enter private
customer data in the repository.

| Device / OS / browser       | Input            | URL or state                  | Expected result                                              | Result / evidence    |
| --------------------------- | ---------------- | ----------------------------- | ------------------------------------------------------------ | -------------------- |
| Current iPhone / iOS Safari | NDEF NFC tap     | active card                   | published profile opens without an app                       | _pending manual run_ |
| Current Android / Chrome    | NDEF NFC tap     | active card                   | published profile opens without an app                       | _pending manual run_ |
| Current iPhone / iOS Safari | QR scan from PNG | active card QR                | same published profile as NFC/direct URL                     | _pending manual run_ |
| Current Android / Chrome    | QR scan from SVG | active card QR                | same published profile as NFC/direct URL                     | _pending manual run_ |
| Current iPhone / iOS Safari | direct URL       | stable slug                   | published profile usable under 2 seconds on normal 4G target | _pending manual run_ |
| Current Android / Chrome    | direct URL       | stable slug                   | published profile usable under 2 seconds on normal 4G target | _pending manual run_ |
| Current iPhone / iOS Safari | NFC/QR tap       | deactivated/replaced card     | branded inactive page; former profile hidden                 | _pending manual run_ |
| Current Android / Chrome    | NFC/QR tap       | unpublished/suspended profile | branded unavailable page; identity hidden                    | _pending manual run_ |
| Current iPhone / iOS Safari | Save contact     | published profile             | vCard imports only approved fields                           | _pending manual run_ |

Record device model, OS version, browser version, deployment URL, card token, timestamp, and a
redacted screenshot or screen recording outside source control.
