// @ts-ignore
import * as d3 from "d3";
import { DataViewRow } from "spotfire/spotfire-api-1-2";

// /**
//  * Adds a tooltip to a D3 selection object
//  * @param {Spotfire.mod} mod
//  * @param {Array<Spotfire.Axis>} items
//  */
export function highlight(mod: Spotfire.Mod, tooltipDisplayAxes: Spotfire.Axis[], highlightColor: string) {
    function highlight(selection: any) {
        selection.on("mouseenter", showTooltip).on("mouseleave", hideTooltip);
    }

    function hideTooltip() {
        // d3.select("#HighlightShape").remove();
        d3.select(".highlighter").remove();
        mod.controls.tooltip.hide();
    }

    /**
     * Show the tooltip
     * @param {Spotfire.DataViewRow} row
     * @param {Int} i
     */
    function showTooltip(event: any, row: DataViewRow) {
        let radius = parseFloat(d3.select(this).attr("r"));

        d3.select(this)
            .clone()
            .raise()
            .attr("r", radius + 3)
            .style("fill", "None")
            .style("stroke", highlightColor)
            .classed("highlighter", true);

        let tooltipItems: string[] = [];
        tooltipDisplayAxes.forEach((axis) => {
            if (axis.expression == "") {
                return;
            }
            if (axis.expression == "<>") {
                return;
            }

            let tooltipItemText = getDisplayName(axis);
            tooltipItemText += ": ";

            // @ts-ignore
            if (axis.mode == "categorical" || axis.isCategorical) {
                // color axis does not implement the correct interface
                tooltipItemText += row.categorical(axis.name).formattedValue();
            } else {
                tooltipItemText += row.continuous(axis.name).formattedValue();
            }
            if (!tooltipItems.includes(tooltipItemText)) {
                tooltipItems.push(tooltipItemText);
            }
        });
        let tooltipText = tooltipItems.join("\n");

        mod.controls.tooltip.show(tooltipText);
    }

    /**
     *
     * @param {Spotfire.Axis} axis
     */
    function getDisplayName(axis: Spotfire.Axis) {
        return axis.parts
            .map((node) => {
                return node.displayName;
            })
            .join();
    }

    return highlight;
}
