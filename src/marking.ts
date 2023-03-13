// @ts-ignore
import * as d3 from "d3";
import { DataViewRow } from "spotfire/spotfire-api-1-2";
import { Circle, Rect, circleInRect } from "./geometry";

// /**
//  * Creates a new D3 dragbehavior to handle marking selections
//  * @param {d3.Selection} svg
//  * @param {d3.Selection} markingRect
//  * @param {d3.Selection} referenceSelection
//  * @param {Spotfire.DataView} dataView
//  * @param {Array<Number>} [fixRect] [fixedX, fixedY, fixedWidth, fixedHeight]
//  * @returns {d3.DragBehavior}
//  */
export function markingHandler(
    svg: d3.selection, //d3.Selection<SVGSVGElement, unknown, HTMLElement, any>,
    markingRect: d3.selection, // d3.Selection<SVGRectElement, unknown, HTMLElement, any>,
    markerSelector: string, //d3.Selection<SVGRectElement, unknown, HTMLElement, any>
    dataView: Spotfire.DataView,
    fixRect?: (number | undefined)[]
) {
    let fixX = fixRect ? fixRect[0] : undefined;
    let fixY = fixRect ? fixRect[1] : undefined;
    let fixedWidth = fixRect ? fixRect[2] : undefined;
    let fixedHeight = fixRect ? fixRect[3] : undefined;
    var x0 = 0;
    var y0 = 0;
    var x1 = 0;
    var y1 = 0;
    // @ts-ignore
    var marking = false;

    function dragstarted(event: any) {
        // fix issue with popup not closing when drag selection is initiated
        // by simulating a mousedown
        let markingElement: Element = markingRect.node() as Element;
        const clickEvent = new MouseEvent(`mousedown`, {
            view: window,
            bubbles: true,
            cancelable: true
        });
        markingElement.dispatchEvent(clickEvent);

        let m = d3.pointer(event);
        marking = false;
        x0 = m[0];
        y0 = m[1];
        x1 = x0;
        y1 = y0;

        markingRect
            .attr("x", fixX || x0)
            .attr("y", fixY || y0)
            .attr("height", fixedHeight || 0)
            .attr("width", fixedWidth || 0)
            .attr("class", "activeMarking");
    }

    function dragged(event: any) {
        var m = d3.pointer(event);
        x1 = m[0];
        y1 = m[1];

        // Begin marking when mouse moved a bit.
        marking = marking || Math.max(Math.abs(x0 - x1), Math.abs(y0 - y1)) > 2;

        if (!fixedWidth) {
            markingRect.attr("width", Math.abs(x1 - x0)).attr("x", x1 > x0 ? fixX || x0 : fixX || x1);
        }
        if (!fixedHeight) {
            markingRect.attr("height", Math.abs(y1 - y0)).attr("y", y1 > y0 ? fixY || y0 : fixY || y1);
        }
    }

    function dragended(event: any) {
        if (!marking) {
            return;
        }

        marking = false;

        let markingRectShape: Rect = {
            x: parseInt(markingRect.attr("x")),
            y: parseInt(markingRect.attr("y")),
            width: parseInt(markingRect.attr("width")),
            height: parseInt(markingRect.attr("height"))
        };

        let markersInMarking = svg.selectAll(markerSelector).filter(function (d: any) {
            let marker: d3.selection = d3.select(this);

            let svgElementType = marker.node().tagName.toLowerCase();

            switch (svgElementType) {
                case "circle":
                    let markerShape: Circle = {
                        cx: parseInt(marker.attr("cx")),
                        cy: parseInt(marker.attr("cy")),
                        r: parseInt(marker.attr("r"))
                    };
                    return circleInRect(markerShape, markingRectShape);

                //TODO add code for other shapes
                default:
                    return false;
            }
        });

        if (markersInMarking.empty()) {
            dataView.clearMarking();
        } else {
            markersInMarking.each((row: DataViewRow) => {
                markRow(row, dataView, event.sourceEvent.ctrlKey || event.sourceEvent.metaKey);
            });
        }
        markingRect.attr("class", "inactiveMarking");
    }

    function markRow(row: DataViewRow, dataView: Spotfire.DataView, toggle: boolean) {
        let mode: Spotfire.MarkingOperation = toggle ? "ToggleOrAdd" : "Replace";
        row.mark(mode);
    }

    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}
