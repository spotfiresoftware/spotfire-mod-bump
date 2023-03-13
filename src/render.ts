// @ts-ignore
import * as d3 from "d3";
import { Grid } from "./Grid";
import { DataViewHierarchyNode, DataViewRow, ModProperty } from "spotfire/spotfire-api-1-2";
import { highlight } from "./Highlight";
import { markingHandler } from "./marking";
import { getLuminance } from "polished";

const lineTransparency = 1,
    relativeMarkerSize = 0.8;

type FIX_TYPE = any;

// set up drawing layers
const modContainer = d3.select("#mod-container");

const svg = modContainer.append("svg").attr("xmlns", "http://www.w3.org/2000/svg");

const defs = svg.append("defs");

// Layer 1: The visualization guide layer
const guideLayer = svg.append("g").attr("id", "guideLayer");

const rightLabelGroup = guideLayer
    .append("g")
    .attr("id", "rightLabelGroup")
    .style("cursor", "default")
    .style("user-select", "none");

const leftLabelGroup = guideLayer
    .append("g")
    .attr("id", "leftLabelGroup")
    .style("curser", "default")
    .style("user-select", "none");

const rankingAxisScaleGuideGroup = guideLayer
    .append("g")
    .attr("id", "yAxisScale")
    .style("cursor", "default")
    .style("user-select", "none");

const columnLabelGroup = guideLayer
    .append("g")
    .attr("id", "topGuideGroup")
    .style("cursor", "default")
    .style("user-select", "none");

// Layer 2: The interaction layer

const interactionLayer = svg.append("g").attr("id", "markingLayer").attr("fill", "white").attr("fill-opacity", 0.0);

const periodAxisMarkingRect = interactionLayer.append("rect").attr("id", "periodAxisScaleGuideArea");

const rankingAxisMarkingRect = interactionLayer.append("rect").attr("id", "rankingAxisScaleGuideArea");

const graphMarkingRect = interactionLayer.append("rect").attr("id", "graphMarkingRect");

// Layer 3: The line layer
const graphLayer = svg.append("g").attr("id", "lineLayer");

// Layer 5: The marking overlay layer
const markingOverlayRect = svg.append("rect").attr("id", "markingOverlayRect").attr("class", "inactiveMarking");

/*
Main rendering loop
*/

export async function render(
    dataView: Spotfire.DataView,
    windowSize: Spotfire.Size,
    columnLabelOrientation: Spotfire.ModProperty<string>,
    toolTipDisplayAxes: Spotfire.Axis[],
    mod: Spotfire.Mod
) {
    // configure styling

    let context = mod.getRenderContext();
    let fontSize = parseInt(context.styling.general.font.fontSize.toString()); // workaround bug in Spotfire 11.4 where fontSize returns string

    document.querySelector("#extra_styling")!.innerHTML = `
    .tick { color: ${context.styling.scales.tick.stroke} }
    .domain { color: ${context.styling.scales.line.stroke} }
    .bottomGraphBorder { color: ${context.styling.scales.line.stroke} }
    .leftGraphBorder { color: ${context.styling.scales.line.stroke} }
    .dot.marked { stroke: ${context.styling.general.font.color}}
    .label { fill: ${context.styling.general.font.color}; font-size: ${fontSize}px; font-weight: ${context.styling.general.font.fontWeight}; font-style: ${context.styling.general.font.fontStyle};}
    .leftLabels { fill: ${context.styling.general.font.color}; font-size: ${fontSize}px; font-weight: ${context.styling.general.font.fontWeight}; font-style: ${context.styling.general.font.fontStyle};}
    .rightLabels { fill: ${context.styling.general.font.color}; font-size: ${fontSize}px; font-weight: ${context.styling.general.font.fontWeight}; font-style: ${context.styling.general.font.fontStyle};}
    .columnLabels { fill: ${context.styling.general.font.color}; font-size: ${fontSize}px; font-weight: ${context.styling.general.font.fontWeight}; font-style: ${context.styling.general.font.fontStyle};}
    .rowLabels { fill: ${context.styling.general.font.color}; font-size: ${fontSize}px; font-weight: ${context.styling.general.font.fontWeight}; font-style: ${context.styling.general.font.fontStyle};}
    .markerLabels { fill: ${context.styling.general.font.color}; font-size: ${fontSize}px; font-weight: ${context.styling.general.font.fontWeight}; font-style: ${context.styling.general.font.fontStyle};}
     `;

    let highlightColor = context.styling.general.font.color; // using font color from theme to adapt to light and dark canvas styling since the actual highlight color isn't availabe in the Mods API.

    const popout = mod.controls.popout;
    const { section } = popout;
    const { radioButton } = popout.components;

    const is = (property: ModProperty) => (value: any) => property.value() == value;

    const popoutContent = () => [
        section({
            heading: "Label Orientation",
            children: [
                radioButton({
                    name: columnLabelOrientation.name,
                    text: "Horizontal",
                    value: "Horizontal",
                    checked: is(columnLabelOrientation)("Horizontal")
                }),
                radioButton({
                    name: columnLabelOrientation.name,
                    text: "Vertical",
                    value: "Vertical",
                    checked: is(columnLabelOrientation)("Vertical")
                })
            ]
        })
    ];

    // get data

    const hasLineBy = !!(await dataView.categoricalAxis("Line By"));
    const hasPeriod = !!(await dataView.categoricalAxis("Period"));
    const hasRanking = !!(await dataView.categoricalAxis("Ranking"));

    if (!hasLineBy || !hasPeriod || !hasRanking) {
        graphLayer.selectAll("*").remove();
        return;
    }
    const rows = await dataView.allRows();
    if (!rows || rows.length < 1) {
        graphLayer.selectAll("*").remove();
        return;
    }

    let periodAxisLeaves = (await (await dataView.hierarchy("Period"))?.root())?.leaves();

    if (!periodAxisLeaves || periodAxisLeaves.length == 0) {
        columnLabelGroup.selectAll("*").remove();
        return;
    }

    let rankingAxisLeaves = (await (await dataView.hierarchy("Ranking"))?.root())?.leaves();

    if (!rankingAxisLeaves || rankingAxisLeaves.length == 0) {
        rankingAxisScaleGuideGroup.selectAll("*").remove();
        leftLabelGroup.selectAll("*").remove();
        rightLabelGroup.selectAll("*").remove();
        return;
    }

    let lineByAxisLeaves = (await (await dataView.hierarchy("Line By"))?.root())?.leaves();

    if (!lineByAxisLeaves || lineByAxisLeaves.length == 0) {
        graphLayer.selectAll("*").remove();
        return;
    }

    // determine the size of each visualization component

    let modHeight = windowSize.height;
    let modWidth = windowSize.width;
    svg.attr("width", modWidth).attr("height", modHeight);
    svg.attr("viewbox", `0 0 ${modWidth} ${modHeight}`);

    // give the column labels as much space as needed by the longest column label
    let maxColumnLabelWidth =
        (fontSize / 2) *
        Math.max.apply(
            Math,
            periodAxisLeaves.map((node: DataViewHierarchyNode) => node.formattedPath().length)
        );

    let columnLabelHeight = columnLabelOrientation.value() == "Horizontal" ? fontSize : maxColumnLabelWidth + fontSize;

    // give the row labels as much space as needed by the longest row label
    let maxRowLabelWidth =
        (fontSize / 2) *
        Math.max.apply(
            Math,
            periodAxisLeaves[0].rows().map((row: DataViewRow) => row.leafNode("Line By").formattedValue().length)
        );

    let leftLabelWidth = maxRowLabelWidth + fontSize;
    let rightLabelWidth = maxRowLabelWidth + fontSize;

    // give the ranking labels as much space as needed by the longest rank number
    let maxRankLabelWidth = Math.floor(Math.log10(rankingAxisLeaves.length) + 1);
    let rankingScaleWidth = maxRankLabelWidth * fontSize + fontSize;

    // the size of each marker is a percentage of the space available at the intersection of rows and columns
    let markerSize =
        relativeMarkerSize *
        Math.min(
            (modHeight - columnLabelHeight) / rankingAxisLeaves.length,
            (modWidth - rankingScaleWidth - leftLabelWidth - rightLabelWidth) / periodAxisLeaves.length
        );

    // markers size can't be less than 0
    markerSize = markerSize < 0 ? 0 : markerSize;

    // lines connecting markers should be 1/4 of the size of each marker.
    let lineWidth = markerSize / 4;

    let innerMargin = markerSize / 2 + 2;

    let grid = new Grid(
        modWidth,
        modHeight,
        `${rankingScaleWidth}px ${leftLabelWidth}px ${innerMargin}px 1fr ${innerMargin}px ${rightLabelWidth}px`,
        `${columnLabelHeight}px ${innerMargin}px 1fr ${innerMargin}px ${fontSize}px`
    );

    let rightLabelArea = grid.getCoords("f3");
    let leftLabelArea = grid.getCoords("b3");
    let periodAxisArea = grid.getCoords("d1");
    let rankingAxisArea = grid.getCoords("a3");
    let graphDrawingArea = grid.getCoords("d3");
    let periodAxisMarkingArea = grid.getCoords("c1:e1");
    let rankingAxisMarkingArea = grid.getCoords("a2:a4");
    let graphMarkingArea = grid.getCoords("c2:e4");

    // 2-D rectangle marking in the graph area
    graphMarkingRect
        .attr("x", graphMarkingArea.x1)
        .attr("y", graphMarkingArea.y1)
        .attr("width", graphMarkingArea.width)
        .attr("height", graphMarkingArea.height)
        .call(markingHandler(svg, markingOverlayRect, ".marker", dataView) as FIX_TYPE)
        .on("click", (event: MouseEvent) => {
            dataView.clearMarking();
        });

    // Add one dimensional marking by dragging on the column label area
    periodAxisMarkingRect
        .attr("x", periodAxisMarkingArea.x1)
        .attr("y", periodAxisMarkingArea.y1)
        .attr("width", periodAxisMarkingArea.width)
        .attr("height", periodAxisMarkingArea.height)
        .call(
            markingHandler(svg, markingOverlayRect, ".marker", dataView, [
                undefined,
                1,
                undefined,
                graphMarkingArea.height
            ]) as FIX_TYPE
        )
        .on("click", (e: MouseEvent) => {
            popout.show(
                {
                    x: e.x,
                    y: e.y,
                    autoClose: true,
                    alignment: "Top",
                    onChange: (event) => {
                        const { name, value } = event;
                        name == columnLabelOrientation.name && columnLabelOrientation.set(value);
                    }
                },
                popoutContent
            );
            return true;
        });

    // Add one dimensional marking by dragging on the rowlabel area
    rankingAxisMarkingRect
        .attr("x", rankingAxisMarkingArea.x1)
        .attr("y", rankingAxisMarkingArea.y1)
        .attr("width", rankingAxisMarkingArea.width)
        .attr("height", rankingAxisMarkingArea.height)
        .on("click", (event: MouseEvent) => {
            dataView.clearMarking();
            return true;
        })
        .call(
            markingHandler(svg, markingOverlayRect, ".marker", dataView, [
                graphMarkingArea.x1 + 0.5,
                undefined,
                graphMarkingArea.width - 0.5,
                undefined
            ]) as FIX_TYPE
        );

    // create scales

    let rankingScale = d3
        .scalePoint()
        .range([graphDrawingArea.y1, graphDrawingArea.y2])
        .domain(rankingAxisLeaves.map((node: DataViewHierarchyNode) => node.formattedPath()));

    let periodScale = d3
        .scalePoint()
        .range([graphDrawingArea.x1, graphDrawingArea.x2])
        .domain(periodAxisLeaves.map((node: DataViewHierarchyNode) => node.formattedPath()));

    // draw column labels

    let numberOfColumnLabels = periodAxisLeaves.length;
    let labelWidth = columnLabelOrientation.value() == "Horizontal" ? maxColumnLabelWidth : fontSize;
    let columnLabelSpacing = Math.ceil((labelWidth * numberOfColumnLabels) / graphDrawingArea.width);

    let displayColumnLabels = periodAxisLeaves.filter((value, index) => !(index % columnLabelSpacing));

    let columnLabels = columnLabelGroup.selectAll(".columnLabels").data(displayColumnLabels);

    let newColumnLabels = columnLabels.enter().append("text");

    let allColumnLabels = columnLabels.merge(newColumnLabels);

    allColumnLabels
        .attr("class", "columnLabels")
        .attr("x", 0)
        .attr("y", 0)
        .attr("dy", "-0.5em")
        .attr("text-anchor", columnLabelOrientation.value() == "Horizontal" ? "middle" : "start")
        .attr("alignment-baseline", columnLabelOrientation.value() == "Horizontal" ? "middle" : "hanging")
        .attr("transform", (node: DataViewHierarchyNode) => {
            if (columnLabelOrientation.value() == "Vertical") {
                return `translate(${periodScale(node.formattedPath())},${periodAxisArea.y2}) rotate(270)`;
            } else {
                return `translate(${periodScale(node.formattedPath())},${periodAxisArea.y2})`;
            }
        })
        .text((v: DataViewHierarchyNode) => v.formattedPath());

    columnLabels.exit().remove();

    //#region draw row labels

    let rowLabelHeight = fontSize;
    let numberOfRows = rankingAxisLeaves.length;
    let rowLabelSpacing = Math.ceil((rowLabelHeight * numberOfRows) / graphDrawingArea.height);

    let displayRanks = rankingAxisLeaves.filter((value, index) => !(index % rowLabelSpacing));
    let rowNumberLabels = rankingAxisScaleGuideGroup.selectAll(".rowLabels").data(displayRanks);

    let newRowNumberLabels = rowNumberLabels.enter().append("text");

    let allRowNumberLabels = rowNumberLabels.merge(newRowNumberLabels);

    allRowNumberLabels
        .attr("class", "rowLabels")
        .attr("y", (node: DataViewHierarchyNode) => rankingScale(node.formattedPath()))
        .attr("x", rankingAxisArea.x2)
        .attr("dx", "-0.5em")
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .text((node: DataViewHierarchyNode) => node.formattedPath());

    rowNumberLabels.exit().remove();

    //#region draw left labels

    let displayLeftLabels = periodAxisLeaves[0]
        .rows()
        .filter(
            (row: DataViewRow) => !((parseInt(row.categorical("Ranking")?.formattedValue()) - 1) % rowLabelSpacing)
        );
    let leftLabels = leftLabelGroup.selectAll(".leftLabels").data(displayLeftLabels);

    let newLeftLabels = leftLabels.enter().append("text");

    let allLeftLabels = leftLabels.merge(newLeftLabels);

    allLeftLabels
        .attr("class", "leftLabels")
        .attr("x", leftLabelArea.x1)
        .attr("y", (row: DataViewRow) => rankingScale(row.categorical("Ranking")?.formattedValue()))
        .attr("dx", "0.5em")
        .attr("dominant-baseline", "central")
        .style("font-weight", (row: DataViewRow) => (row.leafNode("Line By").markedRowCount() > 0 ? "bold" : "normal"))
        .text((row: DataViewRow) => row.categorical("Line By").formattedValue());

    allLeftLabels.on("click", function (event: MouseEvent, row: DataViewRow) {
        markEntireLine(row, dataView, event.ctrlKey || event.metaKey);
        return true;
    });

    leftLabels.exit().remove();

    //#endregion

    //#region draw right labels
    let displayRightLabels = periodAxisLeaves[periodAxisLeaves.length - 1]
        .rows()
        .filter(
            (row: DataViewRow) => !((parseInt(row.categorical("Ranking")?.formattedValue()) - 1) % rowLabelSpacing)
        );

    let rightLabels = rightLabelGroup.selectAll(".rightLabels").data(displayRightLabels);

    let newRightLabels = rightLabels.enter().append("text");

    let allRightLabels = rightLabels.merge(newRightLabels);

    allRightLabels
        .attr("class", "rightLabels")
        .attr("x", rightLabelArea.x1)
        .attr("y", (row: DataViewRow) => rankingScale(row.categorical("Ranking").formattedValue()))
        .attr("dx", "1em")
        .attr("dominant-baseline", "central")
        .style("font-weight", (row: DataViewRow) => (row.leafNode("Line By").markedRowCount() > 0 ? "bold" : "normal"))
        .text((row: DataViewRow) => row.categorical("Line By").formattedValue());

    allRightLabels.on("click", function (event: MouseEvent, row: DataViewRow) {
        markEntireLine(row, dataView, event.ctrlKey || event.metaKey);
        return true;
    });

    rightLabels.exit().remove();

    //#endregion

    //#region generate color gradients

    let closePairsWithDifferentColors = d3.pairs(rows).filter(function (pairedRow: DataViewRow[]) {
        return (
            pairedRow[1].leafNode("Period").leafIndex - pairedRow[0].leafNode("Period").leafIndex == 1 &&
            pairedRow[0].color().hexCode != pairedRow[1].color().hexCode
        );
    });

    let distinctColorGradients: string[] = [
        ...new Set<string>(
            closePairsWithDifferentColors.map(function (colorPair: DataViewRow[]) {
                return `${colorPair[0].color().hexCode.substring(1)}${colorPair[1].color().hexCode.substring(1)}`;
            })
        )
    ];

    let colorGradients = defs
        .selectAll(".colorGradient")
        .data(distinctColorGradients, function (colorGradient: string) {
            return colorGradient;
        });

    let newColorGradients = colorGradients
        .enter()
        .append("linearGradient")
        .attr("id", (colorGradient: string) => `${colorGradient}`)
        .attr("class", "colorGradient");

    newColorGradients
        .append("stop")
        .attr("offset", "0%")
        .attr(
            "style",
            (colorGradient: string) => `stop-color:#${colorGradient.substring(0, 6)};stop-opacity:${lineTransparency}`
        );

    newColorGradients
        .append("stop")
        .attr("offset", "100%")
        .attr(
            "style",
            (colorGradient: string) => `stop-color:#${colorGradient.substring(6, 12)};stop-opacity:${lineTransparency}`
        );

    colorGradients.exit().remove();

    //#endregion

    //#region draw linesegments

    let lines = graphLayer.selectAll(".line").data(lineByAxisLeaves, (d: DataViewHierarchyNode) => d.key);

    let newLines = lines.enter().append("g");

    newLines.append("g").attr("id", "lineSegments");
    newLines.append("g").attr("id", "markers");
    newLines.append("g").attr("id", "labels");

    let allLines = lines.merge(newLines);

    allLines.attr("class", "line").attr("id", (d: DataViewHierarchyNode) => d.key);

    // let lineSegmentGroup = allLines.select("#linesegments").data([null]).enter().append("g").attr("id", "linesegments");

    // break line on gaps, i.e. only draw line segments between adjacent markers for each group
    let lineSegments = allLines
        .select("#lineSegments")
        .selectAll(".lineSegment")
        .data(function (d: DataViewHierarchyNode) {
            let pairs = d3.pairs(d.rows());
            let closePairs = pairs.filter(function (pairedRow: DataViewRow[]) {
                return pairedRow[1].leafNode("Period").leafIndex - pairedRow[0].leafNode("Period").leafIndex == 1;
            });
            return closePairs;
        });

    let newLineSegments = lineSegments.enter().append("polygon");

    let allLineSegments = lineSegments.merge(newLineSegments);

    allLineSegments.attr("class", "lineSegment");

    allLineSegments
        .attr("points", function (pairedRow: DataViewRow[]) {
            // Connect the circles using polygons that starts at the outer edges of the circles
            // Use previously defined color gradients if the two circles have different colors.
            // Note that svg lines does not work because gradients will be ignored when the geometry of the svg element has no width or height.
            // See https://stackoverflow.com/questions/21638169/svg-line-with-gradient-stroke-wont-display-straight

            const x1 = periodScale(pairedRow[0].categorical("Period").formattedValue());
            const y1 = rankingScale(pairedRow[0].categorical("Ranking").formattedValue());
            const x2 = periodScale(pairedRow[1].categorical("Period").formattedValue());
            const y2 = rankingScale(pairedRow[1].categorical("Ranking").formattedValue());

            var connectionAngle = Math.atan2(x2 - x1, y2 - y1);

            let h = Math.sqrt(Math.pow(markerSize * 0.5, 2) - Math.pow(lineWidth * 0.5, 2));

            let sinAngle = Math.sin(connectionAngle);
            let cosAngle = Math.cos(connectionAngle);

            let dx = h * sinAngle;
            let dy = h * cosAngle;

            let dyy = 0.5 * lineWidth * sinAngle;
            let dxx = 0.5 * lineWidth * cosAngle;

            let pointDescription = `
            ${x1 + dx + dxx},${y1 + dy - dyy} 
            ${x2 - dx + dxx},${y2 - dy - dyy} 
            ${x2 - dx - dxx},${y2 - dy + dyy} 
            ${x1 + dx - dxx},${y1 + dy + dyy}`;

            return pointDescription;
        })
        .attr("fill", (pairedRow: DataViewRow[]) =>
            pairedRow[0].color().hexCode == pairedRow[1].color().hexCode
                ? pairedRow[0].color().hexCode
                : `url(#${pairedRow[0].color().hexCode.substring(1)}${pairedRow[1].color().hexCode.substring(1)})`
        )
        .attr("stroke", "none")
        .on("click", function (event: MouseEvent, pairedRow: DataViewRow[]) {
            markEntireLine(pairedRow[0], dataView, event.ctrlKey || event.metaKey);
            return true;
        });

    lineSegments.exit().remove();

    lines.exit().remove();

    //#endregion draw line segments

    //#region draw markers

    // prepare the tooltip
    let hl = highlight(mod, toolTipDisplayAxes, highlightColor);

    let markers = allLines
        .select("#markers")
        .selectAll(".marker")
        .data(function (d: DataViewHierarchyNode) {
            return d.rows();
        });

    let newMarkers = markers.enter().append("circle");

    let allMarkers = markers.merge(newMarkers);

    allMarkers
        .attr("class", "marker")
        .attr("cx", (row: DataViewRow) => periodScale(row.categorical("Period").formattedValue()))
        .attr("cy", (row: DataViewRow) => rankingScale(row.categorical("Ranking").formattedValue()))
        .attr("r", markerSize / 2)
        .style("fill", (row: DataViewRow) => row.color().hexCode)
        .call(markingHandler(svg, markingOverlayRect, ".marker", dataView) as FIX_TYPE);

    allMarkers
        .on("click", function (event: MouseEvent, row: DataViewRow) {
            markRow(row, dataView, event.ctrlKey || event.metaKey);
            return true;
        })
        .call(hl);

    markers.exit().remove();

    //#region draw markerlabels

    let markerLabels = allLines
        .select("#labels")
        .selectAll(".markerLabels")
        .data(function (d: DataViewHierarchyNode) {
            return d.rows();
        });

    let newMarkerLabels = markerLabels.enter().append("text");

    let allMarkerLabels = markerLabels.merge(newMarkerLabels);

    allMarkerLabels
        .attr("class", "markerLabels")
        .attr("x", (row: DataViewRow) => periodScale(row.categorical("Period").formattedValue()))
        .attr("y", (row: DataViewRow) => rankingScale(row.categorical("Ranking").formattedValue()))
        .text((row: DataViewRow) => row.categorical("Ranking").formattedValue())
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .style("fill", (row: DataViewRow) => `${contrastColor(row.color().hexCode)}`)
        .style("pointer-events", "none")
        .style("opacity", (row: DataViewRow) => (row.isMarked() && markerSize > fontSize ? 1.0 : 0.0));

    markerLabels.exit().remove();

    // move marked lines to the top
    graphLayer
        .selectAll(".line")
        .filter((d: DataViewHierarchyNode) => d.markedRowCount() > 0)
        .raise();

    //#endregion

    //#endregion

    function markRow(row: DataViewRow, dataView: Spotfire.DataView, toggle: boolean) {
        let mode: Spotfire.MarkingOperation = toggle ? "ToggleOrAdd" : "Replace";
        row.mark(mode);
    }

    function markEntireLine(row: DataViewRow, dataView: Spotfire.DataView, toggle: boolean) {
        let mode: Spotfire.MarkingOperation = toggle ? "ToggleOrAdd" : "Replace";
        row.leafNode("Line By").mark(mode);
    }

    function contrastColor(hexCode: string): string {
        let L = getLuminance(hexCode);

        if ((L + 0.05) / (0.0 + 0.05) > (1.0 + 0.05) / (L + 0.05)) {
            return "#000000";
        } else {
            return "#ffffff";
        }
    }

    //#endregion
}
