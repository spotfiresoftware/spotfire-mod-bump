import { render } from "./render";
//import { createColumnAxisPopout } from "./columnAxisPopout";

/*
 * Copyright © 2020. TIBCO Software Inc.
 * This file is subject to the license terms contained
 * in the license file that is distributed with this file.
 */

// Manually import the array polyfills because the API is using functions not supported in IE11.
import "core-js/es/array";

//@ts-check - Get type warnings from the TypeScript language server. Remove if not wanted
/**
 * Get access to the Spotfire Mod API by providing a callback to the initialize method.
 */
window.Spotfire.initialize(async (mod) => {
    /**
     * Create the read function.
     */
    const reader = mod.createReader(
        mod.visualization.data(),
        mod.windowSize(),
        mod.property("columnLabelOrientation"),
        mod.visualization.axis("Period"),
        mod.visualization.axis("Ranking"),
        mod.visualization.axis("Line By")
    );

    /**
     * Store the context.
     */
    const context = mod.getRenderContext();

    /**
     * Creates a function that is part of the main read-render loop.
     * It checks for valid data and will print errors in case of bad data or bad renders.
     * It calls the listener (reader) created earlier and adds itself as a callback to complete the loop.
     */
    reader.subscribe(async (dataView, windowSize, columnLabelOrientation, ...axes) => {
        try {
            const errors = await dataView.getErrors();
            if (errors.length > 0) {
                mod.controls.errorOverlay.show(errors, "DataView");
            } else {
                mod.controls.errorOverlay.hide("DataView");

                /**
                 * Hard abort if row count exceeds an arbitrary selected limit
                 */
                const rowCount = await dataView.rowCount();
                const limit = 100000;
                if (rowCount && rowCount > limit) {
                    mod.controls.errorOverlay.show(
                        `☹️ Cannot render - too many rows (rowCount: ${rowCount}, limit: ${limit}) `
                    );
                    return;
                }

                const allRows = await dataView.allRows();
                if (allRows === null) {
                    return;
                }

                await render(dataView, windowSize, columnLabelOrientation, axes, mod);

                context.signalRenderComplete();

                mod.controls.errorOverlay.hide("General");
            }
        } catch (e) {
            console.error(e);
            mod.controls.errorOverlay.show(e.message || "☹️ Something went wrong, check developer console", "General");
        }
    });
});
