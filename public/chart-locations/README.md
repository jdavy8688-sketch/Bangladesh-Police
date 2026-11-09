# Chart locations

Put precomputed chart point JSON here for fast pie-chart placement.

Suggested files:
- `division.json`
- `district.json`
- `upazila.json`
- `union.json`

Example entry shape:

```json
[
  { "name": "Dhaka", "x": 90.41, "y": 23.81 }
]
```

`name` should match the admin name field (`adm1_en` / `adm2_en` / … or `Unit`).
Coordinates are map x/y (Web Mercator or WGS84 lon/lat — match your web map).
