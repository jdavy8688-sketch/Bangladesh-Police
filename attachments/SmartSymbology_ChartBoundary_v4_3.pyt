# -*- coding: utf-8 -*-
"""
SmartSymbology_ChartBoundary_v4_3.pyt

WEB-MAP-DRIVEN SMART SYMBOLOGY
------------------------------
Target Web Map:
    88891e0cbc8c4ddc91afa166916c0004

This tool does NOT read the ArcGIS Pro map's layer list.

Instead:
1. It connects to the target Portal Web Map.
2. It reads the CURRENT operational layers from that Web Map.
3. It populates the layer dropdown from the Web Map.
4. It reads the CURRENT field schema from the selected Feature Service layer.
5. The user selects Chart or Boundary, then an administrative level.
6. Indicator groups and fields are constrained by the supplied Excel design.
7. Chart layers use pie-chart symbology with data-driven size.
8. Boundary layers use:
       1 field  -> Single Symbol
       2 fields -> Bivariate 3 x 3
       3 fields -> Ternary / Triangle
       4+       -> Predominant Variable
9. It updates only the target operational layer's renderer in the SAME Web Map.
10. It does not create/copy a feature class and does not alter source attributes.

IMPORTANT FOR PUBLISHED WEB TOOL
--------------------------------
Enable the Validate capability when publishing so ArcGIS Enterprise clients
can request refreshed layer/field filters from the live Web Map.

Authentication:
- Local ArcGIS Pro: tries GIS("home")
- ArcGIS Server: preferred ArcGIS API profile "smart_symbology"
  or environment variables:
      SMARTSYM_PORTAL_URL
      SMARTSYM_USERNAME
      SMARTSYM_PASSWORD
"""

import arcpy
import json
import math
import os
import re


class Toolbox(object):
    def __init__(self):
        self.label = "Smart Symbology Web Map Tools"
        self.alias = "smart_symbology_webmap"
        self.tools = [SmartSymbologyWebMapDriven]


class SmartSymbologyWebMapDriven(object):

    WEBMAP_ID = "88891e0cbc8c4ddc91afa166916c0004"
    DEFAULT_PROFILE = "smart_symbology"

    ADMIN_LEVELS = [
        "All",
        "Division",
        "District",
        "Upazila",
        "Union/Ward"
    ]

    LAYER_GROUPS = [
        "Chart",
        "Boundary"
    ]

    LAYER_TITLES = {
        "Chart": {
            "Division": "Division Chart",
            "District": "District Chart",
            "Upazila": "Upazila Chart",
            "Union/Ward": "Union Chart"
        },
        "Boundary": {
            "Division": "Division Boundary",
            "District": "District Boundary",
            "Upazila": "Upazila Boundary",
            "Union/Ward": "Union Boundary"
        }
    }

    ADMIN_TO_EXCEL_KEY = {
        "Division": "Division",
        "District": "District",
        "Upazila": "Upazila",
        "Union/Ward": "Union"
    }

    # Embedded from Bangladesh_Feature_Class_Field_Design_4_Levels_Simplified.
    # "System" and "Administrative" fields are intentionally excluded.
    INDICATOR_GROUPS = {
        "Division": {
            "Administrative Summary": [
                "Total_Union",
                "Population",
                "Total_Educational",
                "Total_Incidents"
            ],
            "Education": [
                "Kindergarten",
                "School",
                "Madrasha",
                "College",
                "University",
                "Total_Educational"
            ],
            "Population": [
                "Population",
                "Male_Population",
                "Female_Population",
                "Floating_Population",
                "Age_0_14",
                "Age_15_34",
                "Age_35_64",
                "Age_65_Plus",
                "Muslim_Population",
                "Hindu_Population",
                "Other_Religion_Population"
            ],
            "Incident Category": [
                "Crime",
                "Judgmental",
                "Resilience",
                "Total_Incidents"
            ],
            "Incident Impact": [
                "Total_Death",
                "Total_Injured"
            ],
            "Household": [
                "Total_Households",
                "Pucca_Households",
                "Semi_Pucca_Households",
                "Kutcha_Jhupri_Households"
            ],
            "Employment": [
                "Employed_Youth",
                "Household_Work_Youth",
                "Looking_For_Job_Youth",
                "Not_Working_Youth"
            ],
            "Employment Sector": [
                "Agriculture_Employment",
                "Industry_Employment",
                "Service_Employment"
            ],
            "Digital Access": [
                "Internet_Users_Youth"
            ]
        },
        "District": {
            "Administrative Summary": [
                "Total_Union",
                "Population",
                "Total_Educational",
                "Total_Incidents"
            ],
            "Education": [
                "Kindergarten",
                "School",
                "Madrasha",
                "College",
                "University",
                "Total_Educational"
            ],
            "Population": [
                "Population",
                "Male_Population",
                "Female_Population",
                "Floating_Population",
                "Age_0_14",
                "Age_15_34",
                "Age_35_64",
                "Age_65_Plus",
                "Muslim_Population",
                "Hindu_Population",
                "Other_Religion_Population"
            ],
            "Incident Category": [
                "Crime",
                "Judgmental",
                "Resilience",
                "Total_Incidents"
            ],
            "Incident Impact": [
                "Total_Death",
                "Total_Injured"
            ],
            "Household": [
                "Total_Households",
                "Pucca_Households",
                "Semi_Pucca_Households",
                "Kutcha_Jhupri_Households"
            ],
            "Employment": [
                "Employed_Youth",
                "Household_Work_Youth",
                "Looking_For_Job_Youth",
                "Not_Working_Youth"
            ],
            "Employment Sector": [
                "Agriculture_Employment",
                "Industry_Employment",
                "Service_Employment"
            ],
            "Digital Access": [
                "Internet_Users_Youth"
            ]
        },
        "Upazila": {
            "Administrative Summary": [
                "Total_Union",
                "Population",
                "Total_Educational",
                "Total_Incidents"
            ],
            "Education": [
                "Kindergarten",
                "School",
                "Madrasha",
                "College",
                "University",
                "Total_Educational"
            ],
            "Population": [
                "Population",
                "Male_Population",
                "Female_Population",
                "Floating_Population",
                "Age_0_14",
                "Age_15_34",
                "Age_35_64",
                "Age_65_Plus",
                "Muslim_Population",
                "Hindu_Population",
                "Other_Religion_Population"
            ],
            "Incident Category": [
                "Crime",
                "Judgmental",
                "Resilience",
                "Total_Incidents"
            ],
            "Incident Impact": [
                "Total_Death",
                "Total_Injured"
            ],
            "Household": [
                "Total_Households",
                "Pucca_Households",
                "Semi_Pucca_Households",
                "Kutcha_Jhupri_Households"
            ],
            "Employment": [
                "Employed_Youth",
                "Household_Work_Youth",
                "Looking_For_Job_Youth",
                "Not_Working_Youth"
            ],
            "Employment Sector": [
                "Agriculture_Employment",
                "Industry_Employment",
                "Service_Employment"
            ],
            "Digital Access": [
                "Internet_Users_Youth"
            ]
        },
        "Union": {
            "Education": [
                "Kindergarten",
                "School",
                "Madrasha",
                "College",
                "University",
                "Total_Educational"
            ],
            "Population": [
                "Population",
                "Male_Population",
                "Female_Population",
                "Floating_Population",
                "Age_0_14",
                "Age_15_34",
                "Age_35_64",
                "Age_65_Plus",
                "Muslim_Population",
                "Hindu_Population",
                "Other_Religion_Population"
            ],
            "Incident Category": [
                "Crime",
                "Judgmental",
                "Resilience",
                "Total_Incidents"
            ],
            "Incident Impact": [
                "Total_Death",
                "Total_Injured"
            ],
            "Household": [
                "Total_Households",
                "Pucca_Households",
                "Semi_Pucca_Households",
                "Kutcha_Jhupri_Households"
            ],
            "Employment": [
                "Employed_Youth",
                "Household_Work_Youth",
                "Looking_For_Job_Youth",
                "Not_Working_Youth"
            ],
            "Employment Sector": [
                "Agriculture_Employment",
                "Industry_Employment",
                "Service_Employment"
            ],
            "Digital Access": [
                "Internet_Users_Youth"
            ]
        }
    }

    CHART_PALETTES = {
        "Auto": [
            (31, 119, 180),
            (255, 127, 14),
            (44, 160, 44),
            (214, 39, 40),
            (148, 103, 189),
            (140, 86, 75),
            (227, 119, 194),
            (188, 189, 34),
            (23, 190, 207),
            (127, 127, 127)
        ],
        "Purple - Teal": [
            (87, 65, 155),
            (49, 130, 189),
            (66, 174, 170),
            (126, 201, 172),
            (186, 92, 169),
            (140, 81, 167),
            (92, 164, 214),
            (45, 188, 178),
            (196, 123, 180),
            (100, 100, 145)
        ],
        "Blue - Red": [
            (49, 130, 189),
            (214, 39, 40),
            (107, 174, 214),
            (239, 138, 98),
            (84, 39, 143),
            (165, 15, 21),
            (116, 196, 118),
            (253, 174, 97),
            (158, 202, 225),
            (202, 178, 214)
        ],
        "Green - Purple": [
            (49, 163, 84),
            (117, 107, 177),
            (116, 196, 118),
            (158, 154, 200),
            (0, 109, 44),
            (84, 39, 143),
            (166, 216, 84),
            (188, 189, 220),
            (102, 194, 165),
            (231, 138, 195)
        ],
        "Orange - Blue": [
            (230, 126, 34),
            (52, 152, 219),
            (243, 156, 18),
            (41, 128, 185),
            (211, 84, 0),
            (31, 97, 141),
            (245, 176, 65),
            (93, 173, 226),
            (183, 149, 11),
            (46, 134, 193)
        ]
    }

    NUMERIC_ESRI_FIELD_TYPES = {
        "esriFieldTypeSmallInteger",
        "esriFieldTypeInteger",
        "esriFieldTypeSingle",
        "esriFieldTypeDouble",
        "esriFieldTypeBigInteger"
    }

    SUPPORTED_FIELD_TYPES = {
        "esriFieldTypeSmallInteger",
        "esriFieldTypeInteger",
        "esriFieldTypeSingle",
        "esriFieldTypeDouble",
        "esriFieldTypeBigInteger",
        "esriFieldTypeString",
        "esriFieldTypeDate"
    }

    BIVARIATE_SCHEMES = {
        "Purple - Teal": {
            "LL": (232, 232, 232),
            "X": (91, 195, 198),
            "Y": (186, 92, 169),
            "XY": (66, 87, 158)
        },
        "Blue - Red": {
            "LL": (238, 238, 238),
            "X": (215, 82, 75),
            "Y": (72, 139, 190),
            "XY": (111, 55, 130)
        },
        "Green - Purple": {
            "LL": (238, 238, 238),
            "X": (74, 170, 108),
            "Y": (145, 96, 170),
            "XY": (61, 85, 112)
        },
        "Orange - Blue": {
            "LL": (238, 238, 238),
            "X": (230, 126, 34),
            "Y": (52, 152, 219),
            "XY": (97, 76, 126)
        }
    }

    TERNARY_SCHEMES = {
        "Red - Green - Blue": {
            "corner_a": (231, 76, 60),
            "corner_b": (46, 204, 113),
            "corner_c": (52, 152, 219)
        },
        "Orange - Green - Blue": {
            "corner_a": (230, 126, 34),
            "corner_b": (39, 174, 96),
            "corner_c": (41, 128, 185)
        },
        "Magenta - Cyan - Yellow": {
            "corner_a": (196, 65, 155),
            "corner_b": (38, 166, 180),
            "corner_c": (230, 190, 55)
        },
        "Red - Purple - Cyan": {
            "corner_a": (210, 65, 70),
            "corner_b": (137, 90, 170),
            "corner_c": (45, 180, 190)
        }
    }

    QUALITATIVE_BRIGHT = [
        (31, 119, 180),
        (255, 127, 14),
        (44, 160, 44),
        (214, 39, 40),
        (148, 103, 189),
        (140, 86, 75),
        (227, 119, 194),
        (127, 127, 127),
        (188, 189, 34),
        (23, 190, 207)
    ]

    QUALITATIVE_MUTED = [
        (102, 194, 165),
        (252, 141, 98),
        (141, 160, 203),
        (231, 138, 195),
        (166, 216, 84),
        (255, 217, 47),
        (229, 196, 148),
        (179, 179, 179)
    ]

    def __init__(self):
        self.label = "Smart Symbology - Chart & Boundary v4.3"
        self.description = (
            "Reads current layers and fields directly from Web Map {} and "
            "updates the selected layer's renderer. No feature class is created."
            .format(self.WEBMAP_ID)
        )
        self.canRunInBackground = False

    # =========================================================================
    # PARAMETERS
    # =========================================================================

    def getParameterInfo(self):

        p0 = arcpy.Parameter(
            displayName="1. Layer Group",
            name="layer_group",
            datatype="GPString",
            parameterType="Required",
            direction="Input"
        )
        p0.filter.type = "ValueList"
        p0.filter.list = list(
            self.LAYER_GROUPS
        )
        p0.value = "Boundary"

        p1 = arcpy.Parameter(
            displayName="2. Administrative Level",
            name="administrative_level",
            datatype="GPString",
            parameterType="Required",
            direction="Input"
        )
        p1.filter.type = "ValueList"
        p1.filter.list = list(
            self.ADMIN_LEVELS
        )
        p1.value = "All"

        p2 = arcpy.Parameter(
            displayName="3. Indicator Group(s)",
            name="indicator_groups",
            datatype="GPString",
            parameterType="Required",
            direction="Input",
            multiValue=True
        )
        p2.filter.type = "ValueList"
        p2.filter.list = []

        p3 = arcpy.Parameter(
            displayName="4. Indicator Field(s)",
            name="indicator_fields",
            datatype="GPString",
            parameterType="Required",
            direction="Input",
            multiValue=True
        )
        p3.filter.type = "ValueList"
        p3.filter.list = []

        p4 = arcpy.Parameter(
            displayName="5. Color Scheme",
            name="color_scheme",
            datatype="GPString",
            parameterType="Optional",
            direction="Input"
        )
        p4.filter.type = "ValueList"
        p4.filter.list = [
            "Auto",
            "Purple - Teal",
            "Blue - Red",
            "Green - Purple",
            "Orange - Blue"
        ]
        p4.value = "Auto"

        p5 = arcpy.Parameter(
            displayName="Update Status",
            name="update_status",
            datatype="GPString",
            parameterType="Derived",
            direction="Output"
        )

        p6 = arcpy.Parameter(
            displayName="Updated Web Map Item ID",
            name="updated_webmap_item_id",
            datatype="GPString",
            parameterType="Derived",
            direction="Output"
        )

        p7 = arcpy.Parameter(
            displayName="Updated Web Map Layer",
            name="updated_webmap_layer",
            datatype="GPString",
            parameterType="Derived",
            direction="Output"
        )

        return [
            p0,
            p1,
            p2,
            p3,
            p4,
            p5,
            p6,
            p7
        ]

    def isLicensed(self):
        return True

    # =========================================================================
    # LIVE VALIDATION
    # =========================================================================

    def updateParameters(self, p):
        """
        Group-first indicator workflow.

        Administrative Level can be one level or All.

        When All is selected, the group and field choices are limited to
        indicators that are valid across all four administrative target layers
        in the selected Chart/Boundary group.

        Indicator Field(s) displays service field aliases, not database field
        names. The aliases are resolved back to real service field names during
        execution.
        """

        layer_group = (
            p[0].valueAsText
            or "Boundary"
        )

        admin_level = (
            p[1].valueAsText
            or "All"
        )

        try:
            gis = self._connect_gis(
                quiet=True
            )

            item, data = self._get_webmap(
                gis
            )

            target_contexts = self._target_contexts(
                data,
                gis,
                layer_group,
                admin_level
            )

            available_groups = self._available_groups_multi(
                admin_level,
                target_contexts,
                layer_group
            )

            p[2].filter.list = available_groups

            selected_groups = self._selected_values(
                p[2]
            )

            valid_groups = [
                group
                for group in selected_groups
                if group in available_groups
            ]

            if valid_groups != selected_groups:
                p[2].values = valid_groups
                selected_groups = valid_groups

            alias_map = self._field_alias_choice_map(
                admin_level,
                selected_groups,
                target_contexts,
                layer_group
            )

            field_choices = list(
                alias_map.keys()
            )

            p[3].filter.list = field_choices

            selected_fields = self._selected_values(
                p[3]
            )

            valid_fields = [
                field_alias
                for field_alias in selected_fields
                if field_alias in field_choices
            ]

            if valid_fields != selected_fields:
                p[3].values = valid_fields

        except Exception:
            # Keep the UI available. execute() returns authoritative errors.
            pass

    def _clear_parameter_message(self, parameter):
        try:
            parameter.clearMessage()
        except Exception:
            pass

    def updateMessages(self, p):

        for parameter in p[:5]:
            self._clear_parameter_message(
                parameter
            )

        layer_group = p[0].valueAsText
        admin_level = p[1].valueAsText

        if not layer_group:
            p[0].setErrorMessage(
                "Select Chart or Boundary."
            )
            return

        if not admin_level:
            p[1].setErrorMessage(
                "Select an administrative level or All."
            )
            return

        groups = self._selected_values(
            p[2]
        )

        if not groups:
            p[2].setErrorMessage(
                "Select at least one indicator group."
            )
            return

        field_aliases = self._selected_values(
            p[3]
        )

        if not field_aliases:
            p[3].setErrorMessage(
                "Select at least one indicator field."
            )
            return

        try:
            gis = self._connect_gis(
                quiet=True
            )

            item, data = self._get_webmap(
                gis
            )

            target_contexts = self._target_contexts(
                data,
                gis,
                layer_group,
                admin_level
            )

            alias_map = self._field_alias_choice_map(
                admin_level,
                groups,
                target_contexts,
                layer_group
            )

            invalid = [
                field_alias
                for field_alias in field_aliases
                if field_alias not in alias_map
            ]

            if invalid:
                p[3].setErrorMessage(
                    "Field(s) are not available for the selected indicator "
                    "group(s) and administrative level(s): {}".format(
                        ", ".join(
                            invalid
                        )
                    )
                )
                return

            canonical_fields = [
                alias_map[field_alias]
                for field_alias in field_aliases
            ]

            if layer_group == "Chart":

                if len(canonical_fields) > 10:
                    p[3].setErrorMessage(
                        "Pie chart symbology supports a maximum of 10 indicators."
                    )
                    return

                for context in target_contexts:

                    non_numeric = [
                        canonical
                        for canonical in canonical_fields
                        if self._schema_type(
                            context["schema"],
                            canonical
                        ) not in self.NUMERIC_ESRI_FIELD_TYPES
                    ]

                    if non_numeric:
                        p[3].setErrorMessage(
                            "Chart indicators must be numeric."
                        )
                        return

            elif len(canonical_fields) >= 2:

                for context in target_contexts:

                    non_numeric = [
                        canonical
                        for canonical in canonical_fields
                        if self._schema_type(
                            context["schema"],
                            canonical
                        ) not in self.NUMERIC_ESRI_FIELD_TYPES
                    ]

                    if non_numeric:
                        p[3].setErrorMessage(
                            "Bivariate, ternary, and predominant symbology "
                            "require numeric fields."
                        )
                        return

        except Exception as ex:
            p[0].setErrorMessage(
                "Could not validate the target Web Map layer(s): {}".format(
                    ex
                )
            )

    # =========================================================================
    # EXECUTION
    # =========================================================================

    def execute(self, p, messages):

        layer_group = p[0].valueAsText
        admin_level = p[1].valueAsText

        groups = self._selected_values(
            p[2]
        )

        selected_aliases = self._selected_values(
            p[3]
        )

        requested_scheme = (
            p[4].valueAsText
            or "Auto"
        )

        if not layer_group:
            raise arcpy.ExecuteError(
                "Layer Group is required."
            )

        if not admin_level:
            raise arcpy.ExecuteError(
                "Administrative Level is required."
            )

        if not groups:
            raise arcpy.ExecuteError(
                "Select at least one indicator group."
            )

        if not selected_aliases:
            raise arcpy.ExecuteError(
                "Select at least one indicator field."
            )

        gis = self._connect_gis()

        item, data = self._get_webmap(
            gis
        )

        target_contexts = self._target_contexts(
            data,
            gis,
            layer_group,
            admin_level
        )

        alias_map = self._field_alias_choice_map(
            admin_level,
            groups,
            target_contexts,
            layer_group
        )

        invalid_aliases = [
            field_alias
            for field_alias in selected_aliases
            if field_alias not in alias_map
        ]

        if invalid_aliases:
            raise arcpy.ExecuteError(
                "The following indicator aliases are no longer valid for the "
                "selected group(s) / level(s): {}".format(
                    ", ".join(
                        invalid_aliases
                    )
                )
            )

        canonical_fields = [
            alias_map[field_alias]
            for field_alias in selected_aliases
        ]

        if (
            layer_group == "Chart"
            and len(
                canonical_fields
            ) > 10
        ):
            raise arcpy.ExecuteError(
                "Pie chart renderer supports a maximum of 10 indicators."
            )

        arcpy.AddMessage(
            "Target Web Map: {}".format(
                self.WEBMAP_ID
            )
        )

        arcpy.AddMessage(
            "Layer Group: {}".format(
                layer_group
            )
        )

        arcpy.AddMessage(
            "Administrative Level: {}".format(
                admin_level
            )
        )

        arcpy.AddMessage(
            "Indicator Group(s): {}".format(
                ", ".join(
                    groups
                )
            )
        )

        arcpy.AddMessage(
            "Indicator Field Alias(es): {}".format(
                ", ".join(
                    selected_aliases
                )
            )
        )

        updated_layer_titles = []
        applied_methods = []

        for context in target_contexts:

            target_layer = context[
                "layer"
            ]

            feature_layer = context[
                "feature_layer"
            ]

            schema = context[
                "schema"
            ]

            fields = self._actual_field_names(
                schema,
                canonical_fields
            )

            aliases = {
                actual_field: selected_aliases[index]
                for index, actual_field in enumerate(
                    fields
                )
            }

            geometry_type = self._geometry_type_from_feature_layer(
                feature_layer
            )

            where = self._webmap_where_clause(
                target_layer
            )

            if layer_group == "Chart":

                non_numeric = [
                    field
                    for field in fields
                    if self._schema_type(
                        schema,
                        field
                    ) not in self.NUMERIC_ESRI_FIELD_TYPES
                ]

                if non_numeric:
                    raise arcpy.ExecuteError(
                        "Chart indicators must be numeric for '{}'."
                        .format(
                            target_layer.get(
                                "title",
                                "layer"
                            )
                        )
                    )

                rows = self._query_rows(
                    feature_layer,
                    fields,
                    where
                )

                if not rows:
                    raise arcpy.ExecuteError(
                        "Chart layer '{}' returned no records.".format(
                            target_layer.get(
                                "title",
                                "layer"
                            )
                        )
                    )

                renderer = self._renderer_chart_with_size(
                    rows,
                    fields,
                    aliases,
                    geometry_type,
                    requested_scheme
                )

                method = "Pie Chart + Data-Driven Size"

            else:

                field_count = len(
                    fields
                )

                if field_count == 1:

                    method = "Single Symbol"

                    renderer = self._renderer_single_symbol(
                        geometry_type,
                        requested_scheme
                    )

                else:

                    non_numeric = [
                        field
                        for field in fields
                        if self._schema_type(
                            schema,
                            field
                        ) not in self.NUMERIC_ESRI_FIELD_TYPES
                    ]

                    if non_numeric:
                        raise arcpy.ExecuteError(
                            "Boundary symbology with two or more fields "
                            "requires numeric indicators for '{}'."
                            .format(
                                target_layer.get(
                                    "title",
                                    "layer"
                                )
                            )
                        )

                    rows = self._query_rows(
                        feature_layer,
                        fields,
                        where
                    )

                    if not rows:
                        raise arcpy.ExecuteError(
                            "Boundary layer '{}' returned no records.".format(
                                target_layer.get(
                                    "title",
                                    "layer"
                                )
                            )
                        )

                    method_key = (
                        "Bivariate Colors (3 x 3)"
                        if field_count == 2
                        else (
                            "Ternary / Triangular Composition"
                            if field_count == 3
                            else "Predominant Variable"
                        )
                    )

                    actual_scheme = self._resolve_scheme(
                        requested_scheme,
                        method_key
                    )

                    if field_count == 2:

                        method = "Bivariate Colors (3 x 3)"

                        renderer = self._renderer_bivariate(
                            rows,
                            fields[0],
                            fields[1],
                            geometry_type,
                            actual_scheme
                        )

                    elif field_count == 3:

                        method = "Ternary / Triangular Composition"

                        renderer = self._renderer_ternary(
                            rows,
                            fields,
                            geometry_type,
                            10,
                            actual_scheme
                        )

                    else:

                        method = "Predominant Variable"

                        renderer = self._renderer_predominance(
                            rows,
                            fields,
                            geometry_type,
                            actual_scheme
                        )

            target_layer.setdefault(
                "layerDefinition",
                {}
            ).setdefault(
                "drawingInfo",
                {}
            )[
                "renderer"
            ] = renderer

            updated_layer_titles.append(
                target_layer.get(
                    "title",
                    target_layer.get(
                        "id",
                        "layer"
                    )
                )
            )

            if method not in applied_methods:
                applied_methods.append(
                    method
                )

            arcpy.AddMessage(
                "Prepared {} -> {}".format(
                    target_layer.get(
                        "title",
                        "layer"
                    ),
                    method
                )
            )

        # Save all requested layer renderer changes in one Web Map update.
        updated = False
        update_error = None

        try:
            updated = bool(
                item.update(
                    data=data
                )
            )

        except Exception as ex:
            update_error = ex

        if not updated:

            try:
                updated = bool(
                    item.update(
                        item_properties={
                            "text": json.dumps(
                                data
                            )
                        }
                    )
                )

            except Exception as ex:
                if update_error is None:
                    update_error = ex

        if not updated:
            raise arcpy.ExecuteError(
                "Web Map update failed. The Portal account must have "
                "permission to update item {}. Details: {}".format(
                    self.WEBMAP_ID,
                    update_error
                )
            )

        verify = item.get_data()

        for context in target_contexts:

            original_layer = context[
                "layer"
            ]

            saved_layer = self._find_layer_by_id(
                verify,
                original_layer.get(
                    "id"
                )
            )

            if saved_layer is None:
                raise arcpy.ExecuteError(
                    "Web Map update returned success, but '{}' could not "
                    "be verified.".format(
                        original_layer.get(
                            "title",
                            "layer"
                        )
                    )
                )

            saved_renderer = (
                saved_layer
                .get(
                    "layerDefinition",
                    {}
                )
                .get(
                    "drawingInfo",
                    {}
                )
                .get(
                    "renderer"
                )
            )

            if not saved_renderer:
                raise arcpy.ExecuteError(
                    "Saved renderer could not be verified for '{}'."
                    .format(
                        original_layer.get(
                            "title",
                            "layer"
                        )
                    )
                )

        status = (
            "SUCCESS: Updated {} layer(s) in the {} group for {}. "
            "Method(s): {}. No feature class was created and source "
            "attributes were not modified."
        ).format(
            len(
                updated_layer_titles
            ),
            layer_group,
            admin_level,
            ", ".join(
                applied_methods
            )
        )

        arcpy.AddMessage(
            status
        )

        p[5].value = status
        p[6].value = self.WEBMAP_ID
        p[7].value = "; ".join(
            updated_layer_titles
        )

    # =========================================================================
    # PORTAL / WEB MAP
    # =========================================================================

    def _connect_gis(
        self,
        quiet=False
    ):

        try:
            from arcgis.gis import GIS

        except Exception as ex:
            raise arcpy.ExecuteError(
                "ArcGIS API for Python is unavailable: {}".format(
                    ex
                )
            )

        errors = []

        profile = os.environ.get(
            "SMARTSYM_PROFILE",
            self.DEFAULT_PROFILE
        ).strip()

        if profile:

            try:
                gis = GIS(
                    profile=profile
                )

                if gis.users.me:

                    if not quiet:
                        arcpy.AddMessage(
                            "Portal authentication: profile '{}', user '{}'."
                            .format(
                                profile,
                                gis.users.me.username
                            )
                        )

                    return gis

            except Exception as ex:
                errors.append(
                    "profile '{}': {}".format(
                        profile,
                        ex
                    )
                )

        portal_url = os.environ.get(
            "SMARTSYM_PORTAL_URL",
            ""
        ).strip()

        username = os.environ.get(
            "SMARTSYM_USERNAME",
            ""
        ).strip()

        password = os.environ.get(
            "SMARTSYM_PASSWORD",
            ""
        )

        if (
            portal_url
            and username
            and password
        ):

            try:
                gis = GIS(
                    portal_url,
                    username,
                    password
                )

                if gis.users.me:

                    if not quiet:
                        arcpy.AddMessage(
                            "Portal authentication: server environment user '{}'."
                            .format(
                                gis.users.me.username
                            )
                        )

                    return gis

            except Exception as ex:
                errors.append(
                    "environment credentials: {}".format(
                        ex
                    )
                )

        try:
            gis = GIS(
                "home"
            )

            if gis.users.me:

                if not quiet:
                    arcpy.AddMessage(
                        "Portal authentication: active ArcGIS session user '{}'."
                        .format(
                            gis.users.me.username
                        )
                    )

                return gis

        except Exception as ex:
            errors.append(
                "GIS('home'): {}".format(
                    ex
                )
            )

        raise arcpy.ExecuteError(
            "Could not authenticate to ArcGIS Enterprise. "
            "Configure profile '{}' or SMARTSYM_PORTAL_URL / "
            "SMARTSYM_USERNAME / SMARTSYM_PASSWORD. {}".format(
                self.DEFAULT_PROFILE,
                " | ".join(errors)
            )
        )

    def _get_webmap(
        self,
        gis
    ):

        item = gis.content.get(
            self.WEBMAP_ID
        )

        if item is None:
            raise arcpy.ExecuteError(
                "Web Map {} was not found.".format(
                    self.WEBMAP_ID
                )
            )

        if str(
            item.type
        ).lower() != "web map":
            raise arcpy.ExecuteError(
                "Item {} is not a Web Map. Type: {}".format(
                    self.WEBMAP_ID,
                    item.type
                )
            )

        data = item.get_data()

        if not isinstance(
            data,
            dict
        ):
            raise arcpy.ExecuteError(
                "Web Map returned invalid JSON."
            )

        return (
            item,
            data
        )

    def _walk_layers(
        self,
        data
    ):

        output = []

        def walk(
            layers
        ):

            for layer in layers or []:

                if not isinstance(
                    layer,
                    dict
                ):
                    continue

                output.append(
                    layer
                )

                children = layer.get(
                    "layers"
                )

                if isinstance(
                    children,
                    list
                ):
                    walk(
                        children
                    )

        walk(
            data.get(
                "operationalLayers",
                []
            )
        )

        return output

    def _eligible_layers(
        self,
        data
    ):
        """
        Use actual Feature Service sublayers as symbology targets.
        Group layers and non-queryable no-URL entries are excluded.
        """

        eligible = []

        for layer in self._walk_layers(
            data
        ):

            url = str(
                layer.get(
                    "url",
                    ""
                )
            ).strip()

            if re.search(
                r"/FeatureServer/\d+/?$",
                url,
                flags=re.IGNORECASE
            ):
                eligible.append(
                    layer
                )

        return eligible

    def _layer_choice_lookup(
        self,
        data
    ):
        """
        Show clean layer titles.

        Only if two operational layers have the same title do we append the
        Web Map layer ID to disambiguate them.
        """

        layers = self._eligible_layers(
            data
        )

        counts = {}

        for layer in layers:

            title = str(
                layer.get(
                    "title",
                    "Unnamed"
                )
            ).strip()

            counts[
                title.lower()
            ] = (
                counts.get(
                    title.lower(),
                    0
                )
                + 1
            )

        lookup = {}

        for layer in layers:

            title = str(
                layer.get(
                    "title",
                    "Unnamed"
                )
            ).strip()

            if counts.get(
                title.lower(),
                0
            ) > 1:

                choice = "{} | {}".format(
                    title,
                    layer.get(
                        "id",
                        ""
                    )
                )

            else:
                choice = title

            lookup[
                choice
            ] = layer

        return lookup

    def _selected_admin_levels(
        self,
        admin_level
    ):

        if admin_level == "All":
            return [
                "Division",
                "District",
                "Upazila",
                "Union/Ward"
            ]

        if admin_level in (
            "Division",
            "District",
            "Upazila",
            "Union/Ward"
        ):
            return [
                admin_level
            ]

        raise arcpy.ExecuteError(
            "Unsupported administrative level: {}".format(
                admin_level
            )
        )

    def _target_layer_title(
        self,
        layer_group,
        admin_level
    ):

        try:
            return self.LAYER_TITLES[
                layer_group
            ][
                admin_level
            ]

        except Exception:
            raise arcpy.ExecuteError(
                "Unsupported layer group / administrative level combination: "
                "{} / {}".format(
                    layer_group,
                    admin_level
                )
            )

    def _target_layer(
        self,
        data,
        layer_group,
        admin_level
    ):

        expected_title = self._target_layer_title(
            layer_group,
            admin_level
        )

        matches = [
            layer
            for layer in self._walk_layers(
                data
            )
            if str(
                layer.get(
                    "title",
                    ""
                )
            ).strip().lower()
            == expected_title.lower()
        ]

        if len(
            matches
        ) == 1:
            return matches[0]

        if not matches:
            raise arcpy.ExecuteError(
                "Required Web Map layer '{}' was not found in item {}."
                .format(
                    expected_title,
                    self.WEBMAP_ID
                )
            )

        raise arcpy.ExecuteError(
            "More than one Web Map layer is named '{}'. "
            "Layer titles must be unique for this tool.".format(
                expected_title
            )
        )

    def _target_contexts(
        self,
        data,
        gis,
        layer_group,
        admin_level
    ):

        contexts = []

        for level in self._selected_admin_levels(
            admin_level
        ):

            target = self._target_layer(
                data,
                layer_group,
                level
            )

            feature_layer = self._feature_layer(
                target,
                gis
            )

            schema = self._field_schema(
                feature_layer
            )

            contexts.append({
                "level": level,
                "layer": target,
                "feature_layer": feature_layer,
                "schema": schema
            })

        return contexts

    def _excel_key(
        self,
        admin_level
    ):

        key = self.ADMIN_TO_EXCEL_KEY.get(
            admin_level
        )

        if not key:
            raise arcpy.ExecuteError(
                "No Excel field design is configured for '{}'."
                .format(
                    admin_level
                )
            )

        return key

    def _schema_lookup(
        self,
        schema
    ):

        return {
            str(
                name
            ).lower(): info
            for name, info in schema.items()
        }

    def _schema_type(
        self,
        schema,
        requested_name
    ):

        info = self._schema_lookup(
            schema
        ).get(
            str(
                requested_name
            ).lower()
        )

        if not info:
            return ""

        return info.get(
            "type",
            ""
        )

    def _actual_field_names(
        self,
        schema,
        canonical_fields
    ):

        lookup = self._schema_lookup(
            schema
        )

        actual = []

        for canonical in canonical_fields:

            info = lookup.get(
                str(
                    canonical
                ).lower()
            )

            if not info:
                raise arcpy.ExecuteError(
                    "Field '{}' does not exist in the current target service."
                    .format(
                        canonical
                    )
                )

            actual.append(
                info[
                    "name"
                ]
            )

        return actual

    def _configured_group_names_for_levels(
        self,
        levels
    ):

        group_lists = []

        for level in levels:

            excel_key = self._excel_key(
                level
            )

            group_lists.append(
                list(
                    self.INDICATOR_GROUPS[
                        excel_key
                    ].keys()
                )
            )

        if not group_lists:
            return []

        first = group_lists[
            0
        ]

        return [
            group
            for group in first
            if all(
                group in group_list
                for group_list in group_lists[
                    1:
                ]
            )
        ]

    def _canonical_fields_for_group_across_levels(
        self,
        group,
        levels
    ):

        field_lists = []

        for level in levels:

            excel_key = self._excel_key(
                level
            )

            fields = self.INDICATOR_GROUPS[
                excel_key
            ].get(
                group,
                []
            )

            field_lists.append(
                list(
                    fields
                )
            )

        if not field_lists:
            return []

        first = field_lists[
            0
        ]

        return [
            field
            for field in first
            if all(
                field in field_list
                for field_list in field_lists[
                    1:
                ]
            )
        ]

    def _canonical_field_valid_in_contexts(
        self,
        canonical,
        target_contexts,
        layer_group
    ):

        for context in target_contexts:

            info = self._schema_lookup(
                context[
                    "schema"
                ]
            ).get(
                canonical.lower()
            )

            if not info:
                return False

            if (
                layer_group == "Chart"
                and info.get(
                    "type"
                )
                not in self.NUMERIC_ESRI_FIELD_TYPES
            ):
                return False

        return True

    def _available_groups_multi(
        self,
        admin_level,
        target_contexts,
        layer_group
    ):

        levels = [
            context[
                "level"
            ]
            for context in target_contexts
        ]

        result = []

        for group in self._configured_group_names_for_levels(
            levels
        ):

            canonical_fields = self._canonical_fields_for_group_across_levels(
                group,
                levels
            )

            if any(
                self._canonical_field_valid_in_contexts(
                    canonical,
                    target_contexts,
                    layer_group
                )
                for canonical in canonical_fields
            ):
                result.append(
                    group
                )

        return result

    def _field_alias_choice_map(
        self,
        admin_level,
        groups,
        target_contexts,
        layer_group
    ):
        """
        Return {display_alias: canonical_field_name}.

        The alias comes from the first selected target service. The canonical
        field must exist in every selected target layer. This makes All safe.
        """

        if not groups:
            return {}

        levels = [
            context[
                "level"
            ]
            for context in target_contexts
        ]

        reference_schema = target_contexts[
            0
        ][
            "schema"
        ]

        reference_lookup = self._schema_lookup(
            reference_schema
        )

        alias_map = {}

        for group in groups:

            canonical_fields = self._canonical_fields_for_group_across_levels(
                group,
                levels
            )

            for canonical in canonical_fields:

                if not self._canonical_field_valid_in_contexts(
                    canonical,
                    target_contexts,
                    layer_group
                ):
                    continue

                reference_info = reference_lookup.get(
                    canonical.lower()
                )

                if not reference_info:
                    continue

                alias = str(
                    reference_info.get(
                        "alias"
                    )
                    or canonical
                ).strip()

                if not alias:
                    alias = canonical

                # Prefer pure aliases. Only disambiguate if the service itself
                # exposes duplicate aliases for two different approved fields.
                if (
                    alias in alias_map
                    and alias_map[
                        alias
                    ] != canonical
                ):
                    alias = "{} ({})".format(
                        alias,
                        canonical.replace(
                            "_",
                            " "
                        )
                    )

                alias_map[
                    alias
                ] = canonical

        return alias_map

    def _feature_layer(
        self,
        webmap_layer,
        gis
    ):

        try:
            from arcgis.features import FeatureLayer

        except Exception as ex:
            raise arcpy.ExecuteError(
                "arcgis.features.FeatureLayer is unavailable: {}".format(
                    ex
                )
            )

        url = webmap_layer.get(
            "url"
        )

        if not url:
            raise arcpy.ExecuteError(
                "Selected Web Map layer has no Feature Service URL."
            )

        return FeatureLayer(
            url,
            gis=gis
        )

    def _find_layer_by_id(
        self,
        data,
        layer_id
    ):

        for layer in self._walk_layers(
            data
        ):

            if str(
                layer.get(
                    "id",
                    ""
                )
            ) == str(
                layer_id
            ):
                return layer

        return None

    # =========================================================================
    # FIELD SCHEMA
    # =========================================================================

    def _field_schema(
        self,
        feature_layer
    ):

        schema = {}

        for field in feature_layer.properties.fields:

            name = str(
                field.get(
                    "name",
                    ""
                )
            )

            if not name:
                continue

            schema[
                name
            ] = {
                "name": name,
                "alias": field.get(
                    "alias",
                    name
                ),
                "type": field.get(
                    "type",
                    ""
                )
            }

        return schema

    def _field_choices(
        self,
        feature_layer
    ):

        schema = self._field_schema(
            feature_layer
        )

        choices = []

        for name, info in schema.items():

            if info["type"] in self.SUPPORTED_FIELD_TYPES:
                choices.append(
                    name
                )

        return choices

    def _selected_values(
        self,
        parameter
    ):

        values = getattr(
            parameter,
            "values",
            None
        )

        if values:

            return [
                str(
                    value
                )
                .strip()
                .strip("'")
                .strip('"')
                for value in values
                if str(
                    value
                ).strip()
            ]

        text = parameter.valueAsText

        if not text:
            return []

        return [
            value
            .strip()
            .strip("'")
            .strip('"')
            for value in text.split(
                ";"
            )
            if value.strip()
        ]

    # =========================================================================
    # SERVICE QUERY
    # =========================================================================

    def _webmap_where_clause(
        self,
        webmap_layer
    ):

        layer_definition = webmap_layer.get(
            "layerDefinition",
            {}
        )

        expression = layer_definition.get(
            "definitionExpression"
        )

        if expression:
            return str(
                expression
            )

        return "1=1"

    def _query_rows(
        self,
        feature_layer,
        fields,
        where
    ):

        out_fields = ",".join(
            fields
        )

        try:
            result = feature_layer.query(
                where=where,
                out_fields=out_fields,
                return_geometry=False,
                return_all_records=True
            )

        except Exception as ex:
            raise arcpy.ExecuteError(
                "Could not query the selected Web Map layer. {}".format(
                    ex
                )
            )

        rows = []

        for feature in result.features:

            attributes = feature.attributes or {}

            rows.append(
                {
                    field: attributes.get(
                        field
                    )
                    for field in fields
                }
            )

        return rows

    # =========================================================================
    # GENERIC NUMERIC HELPERS
    # =========================================================================

    def _safe_number(
        self,
        value
    ):

        if value is None:
            return None

        try:
            number = float(
                value
            )

            if (
                math.isnan(
                    number
                )
                or math.isinf(
                    number
                )
            ):
                return None

            return number

        except Exception:
            return None

    def _numeric_values(
        self,
        rows,
        field
    ):

        values = []

        for row in rows:

            value = self._safe_number(
                row.get(
                    field
                )
            )

            if value is not None:
                values.append(
                    value
                )

        values.sort()

        return values

    def _numeric_row(
        self,
        row,
        fields
    ):

        return [
            self._safe_number(
                row.get(
                    field
                )
            )
            for field in fields
        ]

    def _percentile(
        self,
        values,
        q
    ):

        if not values:
            return None

        if len(
            values
        ) == 1:
            return values[0]

        q = max(
            0.0,
            min(
                1.0,
                q
            )
        )

        position = (
            len(
                values
            ) - 1
        ) * q

        lower = int(
            math.floor(
                position
            )
        )

        upper = int(
            math.ceil(
                position
            )
        )

        if lower == upper:
            return values[
                lower
            ]

        fraction = (
            position - lower
        )

        return (
            values[
                lower
            ]
            * (
                1.0 - fraction
            )
            + values[
                upper
            ]
            * fraction
        )

    def _quantile_breaks(
        self,
        values,
        class_count
    ):

        return [
            self._percentile(
                values,
                index
                / float(
                    class_count
                )
            )
            for index in range(
                1,
                class_count
            )
        ]

    # =========================================================================
    # COLOR / SYMBOL HELPERS
    # =========================================================================

    def _resolve_scheme(
        self,
        requested,
        method
    ):

        requested = (
            requested
            or "Auto"
        )

        if method == "Single Symbol":
            return requested

        if method == "Bivariate Colors (3 x 3)":

            if requested == "Auto":
                return "Purple - Teal"

            if requested in self.BIVARIATE_SCHEMES:
                return requested

            return "Purple - Teal"

        if method == "Ternary / Triangular Composition":

            mapping = {
                "Auto": "Red - Green - Blue",
                "Purple - Teal": "Red - Purple - Cyan",
                "Blue - Red": "Red - Green - Blue",
                "Green - Purple": "Magenta - Cyan - Yellow",
                "Orange - Blue": "Orange - Green - Blue"
            }

            return mapping.get(
                requested,
                "Red - Green - Blue"
            )

        # Predominance
        if requested in (
            "Green - Purple",
            "Orange - Blue"
        ):
            return "Qualitative - Muted"

        return "Qualitative - Bright"

    def _qualitative(
        self,
        scheme
    ):

        if scheme == "Qualitative - Muted":
            return self.QUALITATIVE_MUTED

        return self.QUALITATIVE_BRIGHT

    def _bivariate_palette(
        self,
        name
    ):

        corners = self.BIVARIATE_SCHEMES.get(
            name,
            self.BIVARIATE_SCHEMES[
                "Purple - Teal"
            ]
        )

        result = {}

        for y_class in range(
            1,
            4
        ):

            v = (
                y_class - 1
            ) / 2.0

            for x_class in range(
                1,
                4
            ):

                u = (
                    x_class - 1
                ) / 2.0

                rgb = []

                for channel in range(
                    3
                ):

                    value = (
                        (
                            1 - u
                        )
                        * (
                            1 - v
                        )
                        * corners["LL"][channel]
                        + u
                        * (
                            1 - v
                        )
                        * corners["X"][channel]
                        + (
                            1 - u
                        )
                        * v
                        * corners["Y"][channel]
                        + u
                        * v
                        * corners["XY"][channel]
                    )

                    rgb.append(
                        int(
                            round(
                                value
                            )
                        )
                    )

                result[
                    "{}_{}".format(
                        x_class,
                        y_class
                    )
                ] = tuple(
                    rgb
                )

        return result

    def _ternary_colors(
        self,
        name
    ):

        return self.TERNARY_SCHEMES.get(
            name,
            self.TERNARY_SCHEMES[
                "Red - Green - Blue"
            ]
        )

    def _blend_ternary(
        self,
        a,
        b,
        c,
        colors
    ):

        return tuple(
            max(
                0,
                min(
                    255,
                    int(
                        round(
                            a
                            * colors["corner_a"][channel]
                            + b
                            * colors["corner_b"][channel]
                            + c
                            * colors["corner_c"][channel]
                        )
                    )
                )
            )
            for channel in range(
                3
            )
        )

    def _geometry_type_from_feature_layer(
        self,
        feature_layer
    ):

        geometry = str(
            feature_layer.properties.geometryType
        ).lower()

        if "polygon" in geometry:
            return "polygon"

        if "polyline" in geometry:
            return "polyline"

        return "point"

    def _symbol(
        self,
        geometry_type,
        rgb
    ):

        red = int(
            rgb[0]
        )

        green = int(
            rgb[1]
        )

        blue = int(
            rgb[2]
        )

        if geometry_type == "polygon":

            return {
                "type": "esriSFS",
                "style": "esriSFSSolid",
                "color": [
                    red,
                    green,
                    blue,
                    220
                ],
                "outline": {
                    "type": "esriSLS",
                    "style": "esriSLSSolid",
                    "color": [
                        90,
                        90,
                        90,
                        150
                    ],
                    "width": 0.6
                }
            }

        if geometry_type == "polyline":

            return {
                "type": "esriSLS",
                "style": "esriSLSSolid",
                "color": [
                    red,
                    green,
                    blue,
                    255
                ],
                "width": 2.0
            }

        return {
            "type": "esriSMS",
            "style": "esriSMSCircle",
            "color": [
                red,
                green,
                blue,
                220
            ],
            "size": 8,
            "angle": 0,
            "xoffset": 0,
            "yoffset": 0,
            "outline": {
                "type": "esriSLS",
                "style": "esriSLSSolid",
                "color": [
                    80,
                    80,
                    80,
                    180
                ],
                "width": 0.75
            }
        }

    def _default_symbol(
        self,
        geometry_type
    ):

        return self._symbol(
            geometry_type,
            (
                190,
                190,
                190
            )
        )

    def _arcade_field(
        self,
        field
    ):

        # json.dumps safely quotes/escapes the field name without introducing
        # standalone Windows-path-like string literals into the toolbox.
        return "$feature[" + json.dumps(
            str(
                field
            )
        ) + "]"

    def _arcade_number(
        self,
        value
    ):

        return "{:.15g}".format(
            float(
                value
            )
        )

    # =========================================================================
    # RENDERER: 1 FIELD -> SINGLE SYMBOL
    # =========================================================================

    def _chart_palette(
        self,
        requested_scheme
    ):

        return self.CHART_PALETTES.get(
            requested_scheme,
            self.CHART_PALETTES[
                "Auto"
            ]
        )

    def _chart_total_expression(
        self,
        fields
    ):

        parts = []

        for field in fields:

            ref = self._arcade_field(
                field
            )

            parts.append(
                "When(IsEmpty({0}),0,Max({0},0))".format(
                    ref
                )
            )

        return " + ".join(
            parts
        )

    def _renderer_chart_with_size(
        self,
        rows,
        fields,
        aliases,
        geometry_type,
        requested_scheme
    ):

        if geometry_type not in (
            "point",
            "polygon"
        ):
            raise arcpy.ExecuteError(
                "Pie chart renderer requires a point or polygon layer."
            )

        if len(
            fields
        ) > 10:
            raise arcpy.ExecuteError(
                "Pie chart renderer supports a maximum of 10 indicators."
            )

        palette = self._chart_palette(
            requested_scheme
        )

        attributes = []

        for index, field in enumerate(
            fields
        ):

            rgb = palette[
                index
                % len(
                    palette
                )
            ]

            attributes.append({
                "field": field,
                "label": aliases.get(
                    field,
                    field
                ),
                "color": [
                    int(
                        rgb[0]
                    ),
                    int(
                        rgb[1]
                    ),
                    int(
                        rgb[2]
                    ),
                    255
                ]
            })

        totals = []

        for row in rows:

            total = 0.0

            for field in fields:

                value = self._safe_number(
                    row.get(
                        field
                    )
                )

                if value is not None:
                    total += max(
                        0.0,
                        value
                    )

            totals.append(
                total
            )

        valid_totals = [
            value
            for value in totals
            if value is not None
        ]

        if not valid_totals:
            valid_totals = [
                0.0
            ]

        min_total = min(
            valid_totals
        )

        max_total = max(
            valid_totals
        )

        if max_total <= 0:
            min_data_value = 0
            max_data_value = 1

        elif min_total == max_total:
            min_data_value = 0
            max_data_value = max_total

        else:
            min_data_value = min_total
            max_data_value = max_total

        renderer = {
            "type": "pieChart",
            "attributes": attributes,
            "size": 24,
            "holePercentage": 0,
            "outline": {
                "type": "esriSLS",
                "style": "esriSLSSolid",
                "color": [
                    65,
                    65,
                    65,
                    220
                ],
                "width": 0.6
            },
            "defaultColor": [
                0,
                0,
                0,
                0
            ],
            "defaultLabel": "No data",
            "legendOptions": {
                "title": "Selected indicators"
            },
            "visualVariables": [
                {
                    "type": "sizeInfo",
                    "valueExpression": self._chart_total_expression(
                        fields
                    ),
                    "valueExpressionTitle": "Total selected indicators",
                    "minDataValue": min_data_value,
                    "maxDataValue": max_data_value,
                    "minSize": 12,
                    "maxSize": 48
                }
            ]
        }

        if geometry_type == "polygon":

            renderer[
                "backgroundFillSymbol"
            ] = {
                "type": "esriSFS",
                "style": "esriSFSSolid",
                "color": [
                    0,
                    0,
                    0,
                    0
                ],
                "outline": {
                    "type": "esriSLS",
                    "style": "esriSLSNull",
                    "color": [
                        0,
                        0,
                        0,
                        0
                    ],
                    "width": 0
                }
            }

        return renderer

    def _renderer_single_symbol(
        self,
        geometry_type,
        requested_scheme
    ):

        colors = {
            "Auto": (31, 119, 180),
            "Purple - Teal": (91, 195, 198),
            "Blue - Red": (72, 139, 190),
            "Green - Purple": (74, 170, 108),
            "Orange - Blue": (230, 126, 34)
        }

        rgb = colors.get(
            requested_scheme,
            colors["Auto"]
        )

        return {
            "type": "simple",
            "label": "Single Symbol",
            "description": "",
            "symbol": self._symbol(
                geometry_type,
                rgb
            )
        }

    # =========================================================================
    # RENDERER: 2 FIELDS -> BIVARIATE 3 x 3
    # =========================================================================

    def _renderer_bivariate(
        self,
        rows,
        field_x,
        field_y,
        geometry_type,
        scheme
    ):

        values_x = self._numeric_values(
            rows,
            field_x
        )

        values_y = self._numeric_values(
            rows,
            field_y
        )

        if (
            not values_x
            or not values_y
        ):
            raise arcpy.ExecuteError(
                "Both bivariate fields require numeric values."
            )

        breaks_x = self._quantile_breaks(
            values_x,
            3
        )

        breaks_y = self._quantile_breaks(
            values_y,
            3
        )

        if (
            len(
                breaks_x
            ) < 2
            or len(
                breaks_y
            ) < 2
        ):
            raise arcpy.ExecuteError(
                "Insufficient numeric variation for 3 x 3 bivariate symbology."
            )

        expression = (
            "var x={x}; var y={y}; "
            "if(IsEmpty(x)||IsEmpty(y)){{return '__NODATA__';}} "
            "var xc=When(x<={x1},1,x<={x2},2,3); "
            "var yc=When(y<={y1},1,y<={y2},2,3); "
            "return Text(xc)+'_'+Text(yc);"
        ).format(
            x=self._arcade_field(
                field_x
            ),
            y=self._arcade_field(
                field_y
            ),
            x1=self._arcade_number(
                breaks_x[0]
            ),
            x2=self._arcade_number(
                breaks_x[1]
            ),
            y1=self._arcade_number(
                breaks_y[0]
            ),
            y2=self._arcade_number(
                breaks_y[1]
            )
        )

        palette = self._bivariate_palette(
            scheme
        )

        levels = {
            1: "Low",
            2: "Medium",
            3: "High"
        }

        infos = []

        for y_class in range(
            1,
            4
        ):

            for x_class in range(
                1,
                4
            ):

                code = "{}_{}".format(
                    x_class,
                    y_class
                )

                infos.append({
                    "value": code,
                    "label": "{} {} / {} {}".format(
                        field_x,
                        levels[x_class],
                        field_y,
                        levels[y_class]
                    ),
                    "description": "",
                    "symbol": self._symbol(
                        geometry_type,
                        palette[code]
                    )
                })

        title = "{} x {}".format(
            field_x,
            field_y
        )

        return {
            "type": "uniqueValue",
            "valueExpression": expression,
            "valueExpressionTitle": title,
            "legendOptions": {
                "title": title
            },
            "defaultLabel": "No data / Other",
            "defaultSymbol": self._default_symbol(
                geometry_type
            ),
            "uniqueValueInfos": infos
        }

    # =========================================================================
    # RENDERER: 3 FIELDS -> TERNARY
    # =========================================================================

    def _quantize_ternary(
        self,
        shares,
        resolution
    ):

        raw = [
            max(
                0.0,
                min(
                    1.0,
                    share
                )
            )
            * resolution
            for share in shares
        ]

        base = [
            int(
                math.floor(
                    value
                )
            )
            for value in raw
        ]

        remainder = (
            resolution
            - sum(
                base
            )
        )

        fractions = sorted(
            [
                (
                    raw[index]
                    - base[index],
                    index
                )
                for index in range(
                    3
                )
            ],
            reverse=True
        )

        for index in range(
            remainder
        ):
            base[
                fractions[index][1]
            ] += 1

        return tuple(
            base
        )

    def _renderer_ternary(
        self,
        rows,
        fields,
        geometry_type,
        resolution,
        scheme
    ):

        observed = set()

        for row in rows:

            values = self._numeric_row(
                row,
                fields
            )

            if any(
                value is None
                for value in values
            ):
                continue

            values = [
                max(
                    0.0,
                    value
                )
                for value in values
            ]

            total = sum(
                values
            )

            if total <= 0:
                continue

            shares = [
                value / total
                for value in values
            ]

            quantized = self._quantize_ternary(
                shares,
                resolution
            )

            observed.add(
                "A{:02d}_B{:02d}_C{:02d}".format(
                    *quantized
                )
            )

        if not observed:
            raise arcpy.ExecuteError(
                "No valid ternary combinations were found."
            )

        a = self._arcade_field(
            fields[0]
        )

        b = self._arcade_field(
            fields[1]
        )

        c = self._arcade_field(
            fields[2]
        )

        expression = (
            "var a={a};var b={b};var c={c};"
            "if(IsEmpty(a)||IsEmpty(b)||IsEmpty(c)){{return '__NODATA__';}}"
            "a=Max(a,0);b=Max(b,0);c=Max(c,0);"
            "var t=a+b+c;if(t<=0){{return '__NODATA__';}}"
            "var ra=(a/t)*{r};var rb=(b/t)*{r};var rc=(c/t)*{r};"
            "var qa=Floor(ra);var qb=Floor(rb);var qc=Floor(rc);"
            "var fa=ra-qa;var fb=rb-qb;var fc=rc-qc;"
            "var rem={r}-(qa+qb+qc);"
            "if(rem>=1){{"
            "if(fa>=fb&&fa>=fc){{qa+=1;fa=-1;}}"
            "else if(fb>=fa&&fb>=fc){{qb+=1;fb=-1;}}"
            "else{{qc+=1;fc=-1;}}"
            "}}"
            "if(rem>=2){{"
            "if(fa>=fb&&fa>=fc){{qa+=1;}}"
            "else if(fb>=fa&&fb>=fc){{qb+=1;}}"
            "else{{qc+=1;}}"
            "}}"
            "return 'A'+Text(qa,'00')+'_B'+Text(qb,'00')+'_C'+Text(qc,'00');"
        ).format(
            a=a,
            b=b,
            c=c,
            r=int(
                resolution
            )
        )

        colors = self._ternary_colors(
            scheme
        )

        pattern = re.compile(
            r"^A(\d+)_B(\d+)_C(\d+)$"
        )

        infos = []

        for code in sorted(
            observed
        ):

            match = pattern.match(
                code
            )

            qa, qb, qc = [
                int(
                    value
                )
                for value in match.groups()
            ]

            total = float(
                max(
                    1,
                    qa
                    + qb
                    + qc
                )
            )

            share_a = qa / total
            share_b = qb / total
            share_c = qc / total

            infos.append({
                "value": code,
                "label": "{} {:.0f}% / {} {:.0f}% / {} {:.0f}%".format(
                    fields[0],
                    share_a * 100,
                    fields[1],
                    share_b * 100,
                    fields[2],
                    share_c * 100
                ),
                "description": "",
                "symbol": self._symbol(
                    geometry_type,
                    self._blend_ternary(
                        share_a,
                        share_b,
                        share_c,
                        colors
                    )
                )
            })

        title = "Ternary: {} / {} / {}".format(
            fields[0],
            fields[1],
            fields[2]
        )

        return {
            "type": "uniqueValue",
            "valueExpression": expression,
            "valueExpressionTitle": title,
            "legendOptions": {
                "title": title
            },
            "defaultLabel": "No data / Other",
            "defaultSymbol": self._default_symbol(
                geometry_type
            ),
            "uniqueValueInfos": infos
        }

    # =========================================================================
    # RENDERER: 4+ FIELDS -> PREDOMINANT VARIABLE
    # =========================================================================

    def _renderer_predominance(
        self,
        rows,
        fields,
        geometry_type,
        scheme
    ):

        observed = set()

        for row in rows:

            values = self._numeric_row(
                row,
                fields
            )

            cleaned = [
                0.0
                if value is None
                else max(
                    0.0,
                    value
                )
                for value in values
            ]

            total = sum(
                cleaned
            )

            if total <= 0:
                continue

            index = max(
                range(
                    len(
                        cleaned
                    )
                ),
                key=lambda idx: cleaned[idx]
            )

            observed.add(
                fields[index]
            )

        declarations = []

        for index, field in enumerate(
            fields
        ):

            declarations.append(
                "var v{0}={1};"
                "if(IsEmpty(v{0})){{v{0}=0;}}"
                "v{0}=Max(v{0},0);"
                .format(
                    index,
                    self._arcade_field(
                        field
                    )
                )
            )

        total_expression = "+".join(
            "v{}".format(
                index
            )
            for index in range(
                len(
                    fields
                )
            )
        )

        tests = []

        for index, field in enumerate(
            fields
        ):

            conditions = []

            for other in range(
                len(
                    fields
                )
            ):

                if other == index:
                    continue

                operator = (
                    ">="
                    if index < other
                    else ">"
                )

                conditions.append(
                    "v{}{}v{}".format(
                        index,
                        operator,
                        other
                    )
                )

            condition = (
                "&&".join(
                    conditions
                )
                or "true"
            )

            tests.append(
                'if({}){{return "{}";}}'.format(
                    condition,
                    field.replace(
                        '"',
                        '\\"'
                    )
                )
            )

        expression = (
            "".join(
                declarations
            )
            + "var total="
            + total_expression
            + ";if(total<=0){return '__NODATA__';}"
            + "".join(
                tests
            )
            + "return '__NODATA__';"
        )

        palette = self._qualitative(
            scheme
        )

        field_colors = {
            field: palette[
                index
                % len(
                    palette
                )
            ]
            for index, field in enumerate(
                fields
            )
        }

        infos = []

        for field in fields:

            if field not in observed:
                continue

            infos.append({
                "value": field,
                "label": field,
                "description": "",
                "symbol": self._symbol(
                    geometry_type,
                    field_colors[field]
                )
            })

        return {
            "type": "uniqueValue",
            "valueExpression": expression,
            "valueExpressionTitle": "Predominant Variable",
            "legendOptions": {
                "title": "Predominant Variable"
            },
            "defaultLabel": "No data / Other",
            "defaultSymbol": self._default_symbol(
                geometry_type
            ),
            "uniqueValueInfos": infos
        }
