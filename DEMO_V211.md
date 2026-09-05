# V211 original interface demo

Public entry: `/demo-v211.html`.

This isolated showcase uses the original V211.1.3.2 markup, CSS, and ten UI modules from commit `7897a969401929a65dd0fe3fabf90daa40fbf0a3`. It is not the simplified standalone `/demo.html` design.

The archived legacy demo dataset, cloud boot scripts, production login and persistent storage gate are omitted. A fictional in-memory adapter supplies two properties, nine tenants/contracts and sample payments. The original V202 property, V208 collections, V209 search, V210 dashboard and V211 follow-up renderers operate on these records. Legacy server-only actions show a demo limitation message.

The full interface runs in an opaque-origin iframe with no same-origin, navigation, form or popup permissions. Both shells deny network connections; there is no backend URL, auth token, cookie access or persistent storage. Refresh resets the demonstration. Production authentication is unchanged.

Verify: `node --test tests/demo-v211.test.cjs`, then exercise the property, rent statement, follow-up and payment flows in a browser. This sample does not validate actual production account access or server-side services.
