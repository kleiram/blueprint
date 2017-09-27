/**
 * Copyright 2016 Palantir Technologies, Inc. All rights reserved.
 * Licensed under the BSD-3 License as modified (the “License”); you may obtain a copy
 * of the license at https://github.com/palantir/blueprint/blob/master/LICENSE
 * and https://github.com/palantir/blueprint/blob/master/PATENTS
 */

import { expect } from "chai";
import { mount, ReactWrapper, shallow } from "enzyme";
import * as React from "react";
import * as ReactDOM from "react-dom";

import { Keys, Utils as CoreUtils } from "@blueprintjs/core";
// tslint:disable-next-line:no-submodule-imports
import { dispatchMouseEvent } from "@blueprintjs/core/test/common/utils";

import { Cell, Column, ITableProps, RegionCardinality, Table, TableLoadingOption } from "../src";
import { ICellCoordinates, IFocusedCellCoordinates } from "../src/common/cell";
import * as Classes from "../src/common/classes";
import * as Errors from "../src/common/errors";
import { IColumnIndices, IRowIndices } from "../src/common/grid";
import { Rect } from "../src/common/rect";
import { RenderMode } from "../src/common/renderMode";
import { TableQuadrant } from "../src/quadrants/tableQuadrant";
import { IRegion, Regions } from "../src/regions";
import { CellType, expectCellLoading } from "./cellTestUtils";
import { ElementHarness, ReactHarness } from "./harness";

describe("<Table>", () => {
    const COLUMN_HEADER_SELECTOR = `.${Classes.TABLE_QUADRANT_MAIN} .${Classes.TABLE_COLUMN_HEADERS} .${Classes.TABLE_HEADER}`;

    const harness = new ReactHarness();

    afterEach(() => {
        harness.unmount();
    });

    after(() => {
        harness.destroy();
    });

    it("Defaults to Base26Alpha column names", () => {
        const table = harness.mount(
            <Table>
                <Column />
                <Column />
                <Column name="My Name" />
            </Table>,
        );

        expect(table.find(`.${Classes.TABLE_COLUMN_NAME_TEXT}`, 2).text()).to.equal("My Name");
        expect(table.find(`.${Classes.TABLE_COLUMN_NAME_TEXT}`, 1).text()).to.equal("B");
    });

    it("Adds custom className to table container", () => {
        const CLASS_NAME = "my-custom-class-name";
        const table = harness.mount(
            <Table className={CLASS_NAME}>
                <Column />
                <Column />
                <Column />
            </Table>,
        );
        const hasCustomClass = table.find(`.${Classes.TABLE_CONTAINER}`, 0).hasClass(CLASS_NAME);
        expect(hasCustomClass).to.be.true;
    });

    it("Renders without ghost cells", () => {
        const table = harness.mount(
            <Table>
                <Column />
            </Table>,
        );
        expect(table.find(COLUMN_HEADER_SELECTOR, 0).element).to.be.ok;
        expect(table.find(COLUMN_HEADER_SELECTOR, 1).element).to.not.be.ok;
    });

    it("Renders ghost cells", () => {
        const table = harness.mount(
            <Table fillBodyWithGhostCells={true}>
                <Column />
            </Table>,
        );

        expect(table.find(COLUMN_HEADER_SELECTOR, 0).element).to.be.ok;
        expect(table.find(COLUMN_HEADER_SELECTOR, 1).element).to.be.ok;
    });

    it("Renders correctly with loading options", () => {
        const loadingOptions = [
            TableLoadingOption.CELLS,
            TableLoadingOption.COLUMN_HEADERS,
            TableLoadingOption.ROW_HEADERS,
        ];
        const tableHarness = harness.mount(
            <Table loadingOptions={loadingOptions} numRows={2}>
                <Column name="Column0" renderCell={renderDummyCell} />
                <Column name="Column1" renderCell={renderDummyCell} />
            </Table>,
        );

        expect(tableHarness.element.textContent).to.equal("");

        const cells = tableHarness.element.queryAll(`.${Classes.TABLE_CELL}`);
        cells.forEach(cell => expectCellLoading(cell, CellType.BODY_CELL));

        const columnHeaders = tableHarness.element.queryAll(COLUMN_HEADER_SELECTOR);
        columnHeaders.forEach(columnHeader => expectCellLoading(columnHeader, CellType.COLUMN_HEADER));

        const rowHeaders = tableHarness.element.queryAll(`.${Classes.TABLE_ROW_HEADERS} .${Classes.TABLE_HEADER}`);
        rowHeaders.forEach(rowHeader => expectCellLoading(rowHeader, CellType.ROW_HEADER));
    });

    it("Invokes onVisibleCellsChange on mount", () => {
        const onVisibleCellsChange = sinon.spy();
        const renderCell = () => <Cell>foo</Cell>;
        mount(
            <Table onVisibleCellsChange={onVisibleCellsChange} numRows={3}>
                <Column name="Column0" renderCell={renderCell} />
            </Table>,
        );

        // the callback is called quite often even in the course of a single render cycle.
        // don't bother to count the invocations.
        expect(onVisibleCellsChange.called).to.be.true;
        const rowIndices: IRowIndices = { rowIndexStart: 0, rowIndexEnd: 2 };
        const columnIndices: IColumnIndices = { columnIndexStart: 0, columnIndexEnd: 0 };
        expect(onVisibleCellsChange.lastCall.calledWith(rowIndices, columnIndices)).to.be.true;
    });

    it("Invokes onVisibleCellsChange when the table body scrolls", () => {
        const onVisibleCellsChange = sinon.spy();
        const renderCell = () => <Cell>foo</Cell>;
        const table = mount(
            <Table onVisibleCellsChange={onVisibleCellsChange} numRows={3}>
                <Column name="Column0" renderCell={renderCell} />
            </Table>,
        );
        table.find(`.${Classes.TABLE_QUADRANT_MAIN} .${Classes.TABLE_QUADRANT_SCROLL_CONTAINER}`).simulate("scroll");
        expect(onVisibleCellsChange.callCount).to.be.greaterThan(1);
        const rowIndices: IRowIndices = { rowIndexStart: 0, rowIndexEnd: 2 };
        const columnIndices: IColumnIndices = { columnIndexStart: 0, columnIndexEnd: 0 };
        expect(onVisibleCellsChange.lastCall.calledWith(rowIndices, columnIndices)).to.be.true;
    });

    describe("Instance methods", () => {
        describe("resizeRowsByTallestCell", () => {
            it("Gets and sets the tallest cell by columns correctly", () => {
                const DEFAULT_RESIZE_HEIGHT = 20;
                const MAX_HEIGHT = 40;

                const renderCellLong = () => <Cell wrapText={true}>my cell value with lots and lots of words</Cell>;
                const renderCellShort = () => <Cell wrapText={false}>short value</Cell>;

                let table: Table;

                const saveTable = (t: Table) => (table = t);

                harness.mount(
                    <Table ref={saveTable} numRows={4}>
                        <Column name="Column0" renderCell={renderCellLong} />
                        <Column name="Column1" renderCell={renderCellShort} />
                    </Table>,
                );

                table.resizeRowsByTallestCell(0);
                expect(table.state.rowHeights[0], "resizes by first column").to.equal(MAX_HEIGHT);

                table.resizeRowsByTallestCell(1);
                expect(table.state.rowHeights[0], "resizes by second column").to.equal(DEFAULT_RESIZE_HEIGHT);

                table.resizeRowsByTallestCell([0, 1]);
                expect(table.state.rowHeights[0], "resizes by both column").to.equal(MAX_HEIGHT);

                table.resizeRowsByTallestCell([1]);
                expect(table.state.rowHeights[0], "resizes by second column via array").to.equal(DEFAULT_RESIZE_HEIGHT);

                table.resizeRowsByTallestCell();
                expect(table.state.rowHeights[0], "resizes by visible columns").to.equal(MAX_HEIGHT);
            });

            it("Works on a frozen column when the corresponding MAIN-quadrant column is out of view", () => {
                const CONTAINER_WIDTH = 500;
                const CONTAINER_HEIGHT = 500;
                const EXPECTED_MAX_ROW_HEIGHT = 20;
                const FROZEN_COLUMN_INDEX = 0;

                const renderCell = () => <Cell wrapText={true}>my cell value with lots and lots of words</Cell>;

                // huge values that will force scrolling
                const LARGE_COLUMN_WIDTH = 1000;
                // need 5 columns to ensure the first column won't be included
                // in the 3 "bleed" columns once we scroll rightward.
                const columnWidths = Array(5).fill(LARGE_COLUMN_WIDTH);

                // create a container element to enforce a maximum viewport size
                // small enough to cause scrolling.
                const containerElement = document.createElement("div");
                containerElement.style.width = `${CONTAINER_WIDTH}px`;
                containerElement.style.height = `${CONTAINER_HEIGHT}px`;
                document.body.appendChild(containerElement);

                // need to mount directly into the DOM for this test to work
                const table = mount(
                    <Table numRows={4} numFrozenColumns={1} columnWidths={columnWidths}>
                        <Column name="Column0" renderCell={renderCell} />
                        <Column name="Column1" renderCell={renderCell} />
                        <Column name="Column2" renderCell={renderCell} />
                        <Column name="Column3" renderCell={renderCell} />
                        <Column name="Column4" renderCell={renderCell} />
                    </Table>,
                    { attachTo: containerElement },
                );

                // scroll the frozen column out of view in the MAIN quadrant,
                // and expect a non-zero height.
                const tableInstance = table.instance() as Table;
                tableInstance.scrollToRegion(Regions.column(columnWidths.length - 1));
                tableInstance.resizeRowsByTallestCell(FROZEN_COLUMN_INDEX);
                expect(table.state().rowHeights[0]).to.equal(EXPECTED_MAX_ROW_HEIGHT);

                // clean up
                document.body.removeChild(containerElement);
            });
        });

        describe("scrollToRegion", () => {
            const CONTAINER_WIDTH = 200;
            const CONTAINER_HEIGHT = 200;

            const ROW_HEIGHT = 300;
            const COLUMN_WIDTH = 400;

            const NUM_ROWS = 3;
            const NUM_COLUMNS = 3;

            const TARGET_ROW = 1;
            const TARGET_COLUMN = 2;

            let tableInstance: Table;

            it("should calculate coordinates for scrolling to cell", () => {
                mountTable();
                checkInstanceMethod(
                    Regions.cell(TARGET_ROW, TARGET_COLUMN),
                    TARGET_COLUMN * COLUMN_WIDTH,
                    TARGET_ROW * ROW_HEIGHT,
                );
            });

            it("should calculate coordinates for scrolling to frozen cell", () => {
                mountTable({ numFrozenRows: TARGET_ROW + 1, numFrozenColumns: TARGET_COLUMN + 1 });
                checkInstanceMethod(Regions.cell(TARGET_ROW, TARGET_COLUMN), 0, 0);
            });

            it("should calculate coordinates for scrolling to row", () => {
                mountTable();
                checkInstanceMethod(Regions.row(TARGET_ROW), 0, TARGET_ROW * ROW_HEIGHT);
            });

            it("should calculate coordinates for scrolling to frozen row", () => {
                mountTable({ numFrozenRows: TARGET_ROW + 1 });
                checkInstanceMethod(Regions.row(TARGET_ROW), 0, 0);
            });

            it("should calculate coordinates for scrolling to column", () => {
                mountTable();
                checkInstanceMethod(Regions.column(TARGET_COLUMN), TARGET_COLUMN * COLUMN_WIDTH, 0);
            });

            it("should calculate coordinates for scrolling to frozen column", () => {
                mountTable({ numFrozenColumns: TARGET_COLUMN + 1 });
                checkInstanceMethod(Regions.column(TARGET_COLUMN), 0, 0);
            });

            it("should calculate coordinates for scrolling to full table", () => {
                mountTable();
                checkInstanceMethod(Regions.table(), 0, 0);
            });

            function checkInstanceMethod(region: IRegion, expectedScrollLeft: number, expectedScrollTop: number) {
                // cast as `any` to access private members
                const spy = sinon.spy((tableInstance as any).quadrantStackInstance, "scrollToPosition");
                tableInstance.scrollToRegion(region);
                // just check that the scroll event would be triggered with the proper args; don't
                // bother checking the result of the whole action
                expect(spy.firstCall.args).to.deep.equal([expectedScrollLeft, expectedScrollTop]);
                spy.restore();
            }

            function saveTable(ref: Table) {
                tableInstance = ref;
            }

            function mountTable(tableProps: Partial<ITableProps> & object = {}) {
                mount(
                    <div style={{ width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT }}>
                        <Table
                            columnWidths={Array(NUM_COLUMNS).fill(COLUMN_WIDTH)}
                            numRows={NUM_ROWS}
                            rowHeights={Array(NUM_ROWS).fill(ROW_HEIGHT)}
                            ref={saveTable}
                            {...tableProps}
                        >
                            <Column renderCell={renderDummyCell} />
                            <Column renderCell={renderDummyCell} />
                            <Column renderCell={renderDummyCell} />
                        </Table>
                    </div>,
                );
            }
        });
    });

    describe("Full-table selection", () => {
        const onFocus = sinon.spy();
        const onSelection = sinon.spy();

        afterEach(() => {
            onFocus.reset();
            onSelection.reset();
        });

        it("Selects all and moves focus cell to (0, 0) on click of upper-left corner", () => {
            const table = mountTable();
            selectFullTable(table);

            expect(onSelection.args[0][0]).to.deep.equal([Regions.table()]);
            expect(onFocus.args[0][0]).to.deep.equal({ col: 0, row: 0, focusSelectionIndex: 0 });
        });

        it("Does not move focused cell on shift+click", () => {
            const table = mountTable();
            selectFullTable(table, { shiftKey: true });

            expect(onSelection.args[0][0]).to.deep.equal([Regions.table()]);
            expect(onFocus.called).to.be.false;
        });

        it("Selects and deselects column/row headers when selecting and deselecting the full table", () => {
            const table = mountTable();
            const columnHeader = table.find(COLUMN_HEADER_SELECTOR).at(0);
            const rowHeader = table.find(`.${Classes.TABLE_ROW_HEADERS} .${Classes.TABLE_HEADER}`).at(0);

            selectFullTable(table);
            expect(columnHeader.hasClass(Classes.TABLE_HEADER_SELECTED)).to.be.true;
            expect(rowHeader.hasClass(Classes.TABLE_HEADER_SELECTED)).to.be.true;

            // deselect the full table
            table.setProps({ selectedRegions: [] });
            expect(columnHeader.hasClass(Classes.TABLE_HEADER_SELECTED)).to.be.false;
            expect(rowHeader.hasClass(Classes.TABLE_HEADER_SELECTED)).to.be.false;
        });

        it("Aligns properly with the table borders", () => {
            const table = mountTable();
            selectFullTable(table);

            // we'll pass this to parseInt as the radix argument.
            const BASE_10 = 10;

            // the test framework doesn't necessarily return the expected values
            // via getBoundingClientRect(), so let's just grab the inline
            // width/height styles from the bottom container.
            const bottomContainer = table
                .find(`.${Classes.TABLE_QUADRANT_MAIN}`)
                .find(`.${Classes.TABLE_BOTTOM_CONTAINER}`)
                .getDOMNode() as HTMLElement;
            const { width: expectedWidth, height: expectedHeight } = bottomContainer.style;
            const [expectedWidthAsNumber, expectedHeightAsNumber] = [expectedWidth, expectedHeight].map(n =>
                parseInt(n, BASE_10),
            );

            // use chained .find()'s instead of one long selector just for the
            // sake of reducing line length
            const selectionOverlay = table
                .find(`.${Classes.TABLE_QUADRANT_MAIN}`)
                .find(`.${Classes.TABLE_QUADRANT_BODY_CONTAINER}`)
                .find(`.${Classes.TABLE_SELECTION_REGION}`)
                .getDOMNode() as HTMLElement;
            const { width: actualWidth, height: actualHeight } = selectionOverlay.style;
            const [actualWidthAsNumber, actualHeightAsNumber] = [actualWidth, actualHeight].map(n =>
                parseInt(n, BASE_10),
            );

            // the "actual" selection width should be 1px greater than the
            // "expected' table width, because of a correction necessary for
            // maintaining proper alignment on the bottom/right sides of the
            // selection region (see: styleBodyRegion() in table.tsx).
            expect(actualWidthAsNumber).to.equal(expectedWidthAsNumber + 1);
            expect(actualHeightAsNumber).to.equal(expectedHeightAsNumber + 1);
        });

        function mountTable() {
            return mount(
                <Table enableFocus={true} onFocus={onFocus} onSelection={onSelection} numRows={10}>
                    <Column renderCell={renderDummyCell} />
                    <Column renderCell={renderDummyCell} />
                    <Column renderCell={renderDummyCell} />
                </Table>,
            );
        }

        function selectFullTable(table: ReactWrapper<any, {}>, ...mouseEventArgs: any[]) {
            const menu = table.find(`.${Classes.TABLE_QUADRANT_MAIN} .${Classes.TABLE_MENU}`);
            menu.simulate("mousedown", ...mouseEventArgs).simulate("mouseup", ...mouseEventArgs);
        }
    });

    it("Removes uncontrolled selected region if selectionModes change to make it invalid", () => {
        const table = mount(
            <Table selectionModes={[RegionCardinality.FULL_COLUMNS]}>
                <Column />
            </Table>,
        );
        table.setState({ selectedRegions: [Regions.column(0)] });
        table.setProps({ selectionModes: [] });
        expect(table.state("selectedRegions").length).to.equal(0);
    });

    it("Leaves controlled selected region if selectionModes change to make it invalid", () => {
        const table = mount(
            <Table selectionModes={[RegionCardinality.FULL_COLUMNS]} selectedRegions={[Regions.column(0)]}>
                <Column />
            </Table>,
        );
        table.setProps({ selectionModes: [] });
        expect(table.state("selectedRegions").length).to.equal(1);
    });

    describe("onCompleteRender", () => {
        it("triggers immediately on mount/update with RenderMode.NONE", () => {
            const onCompleteRenderSpy = sinon.spy();
            const table = mount(
                <Table numRows={100} onCompleteRender={onCompleteRenderSpy} renderMode={RenderMode.NONE}>
                    <Column renderCell={renderDummyCell} />
                </Table>,
            );
            expect(onCompleteRenderSpy.callCount, "call count on mount").to.equal(1);
            table.setProps({ numRows: 101 });
            expect(onCompleteRenderSpy.callCount, "call count on update").to.equal(2);
        });

        it("triggers immediately on mount/update with RenderMode.BATCH for very small batches", () => {
            const onCompleteRenderSpy = sinon.spy();
            const numRows = 1;

            // RenderMode.BATCH is the default
            const table = mount(
                <Table numRows={numRows} onCompleteRender={onCompleteRenderSpy}>
                    <Column renderCell={renderDummyCell} />
                </Table>,
            );

            expect(onCompleteRenderSpy.callCount, "call count on mount").to.equal(1);
            table.setProps({ numRows: 2 }); // still small enough to fit in one batch
            expect(onCompleteRenderSpy.callCount, "call count on update").to.equal(2);
        });
    });

    describe("Freezing", () => {
        it("clamps out-of-bounds numFrozenColumns if > number of columns", () => {
            const table1 = mount(<Table numFrozenColumns={1} />);
            expect(getNumClamped(table1, "numFrozenColumns")).to.equal(0);
            const table2 = mount(
                <Table numFrozenColumns={2}>
                    <Column />
                </Table>,
            );
            expect(getNumClamped(table2, "numFrozenColumns")).to.equal(1);
        });

        it("clamps out-of-bounds numFrozenRows if > numRows", () => {
            const table1 = mount(<Table numFrozenRows={1} />);
            expect(getNumClamped(table1, "numFrozenRows")).to.equal(0);
            const table2 = mount(
                <Table numFrozenRows={2} numRows={1}>
                    <Column />
                </Table>,
            );
            expect(getNumClamped(table2, "numFrozenRows")).to.equal(1);
        });

        function getNumClamped(table: ReactWrapper<any, any>, propName: "numFrozenColumns" | "numFrozenRows") {
            // cast as `any` to give us access to private members
            const unprotectedTableNode = table.getNode() as any;
            return propName === "numFrozenColumns"
                ? unprotectedTableNode.getNumFrozenColumnsClamped()
                : unprotectedTableNode.getNumFrozenRowsClamped();
        }
    });

    describe("Resizing", () => {
        it("Resizes selected rows together", () => {
            const table = mountTable();
            const rows = getRowHeadersWrapper(table);
            const resizeHandleTarget = getResizeHandle(rows, 0);

            resizeHandleTarget
                .mouse("mousemove")
                .mouse("mousedown")
                .mouse("mousemove", 0, 2)
                .mouse("mouseup");

            expect(rows.find(`.${Classes.TABLE_HEADER}`, 0).bounds().height).to.equal(3);
            expect(rows.find(`.${Classes.TABLE_HEADER}`, 1).bounds().height).to.equal(3);
            expect(rows.find(`.${Classes.TABLE_HEADER}`, 2).bounds().height).to.equal(1);
            expect(rows.find(`.${Classes.TABLE_HEADER}`, 3).bounds().height).to.equal(1);
            expect(rows.find(`.${Classes.TABLE_HEADER}`, 4).bounds().height).to.equal(3);
            expect(rows.find(`.${Classes.TABLE_HEADER}`, 5).bounds().height).to.equal(3);
            expect(rows.find(`.${Classes.TABLE_HEADER}`, 6).bounds().height).to.equal(3);
            expect(rows.find(`.${Classes.TABLE_HEADER}`, 7).bounds().height).to.equal(1);
            expect(rows.find(`.${Classes.TABLE_HEADER}`, 8).bounds().height).to.equal(3);
        });

        it("Resizes columns when row headers are hidden without throwing an error", () => {
            const table = mountTable({ isRowHeaderShown: false });
            const columnHeader = table.find(`.${Classes.TABLE_COLUMN_HEADERS}`);
            const resizeHandleTarget = getResizeHandle(columnHeader, 0);

            expect(() => {
                resizeHandleTarget
                    .mouse("mousemove")
                    .mouse("mousedown")
                    .mouse("mousemove", 0, 2)
                    .mouse("mouseup");
            }).not.to.throw();
        });

        it("Hides selected-region styles while resizing", () => {
            const table = mountTable();
            const resizeHandleTarget = getResizeHandle(getRowHeadersWrapper(table), 0);

            resizeHandleTarget
                .mouse("mousemove")
                .mouse("mousedown")
                .mouse("mousemove", 0, 2);
            expect(table.find(`.${Classes.TABLE_SELECTION_REGION}`).exists()).to.be.false;

            resizeHandleTarget.mouse("mouseup");
            expect(table.find(`.${Classes.TABLE_SELECTION_REGION}`).exists()).to.be.true;
        });

        it("resizes frozen column on double-click when corresponding MAIN-quadrant column not in view", () => {
            const CONTAINER_WIDTH = 500;
            const CONTAINER_HEIGHT = 500;
            const EXPECTED_COLUMN_WIDTH = 216;
            const FROZEN_COLUMN_INDEX = 0;

            const renderCell = () => <Cell wrapText={false}>my cell value with lots and lots of words</Cell>;

            // huge values that will force scrolling
            const LARGE_COLUMN_WIDTH = 1000;
            // need 5 columns to ensure the first column won't be included
            // in the 3 "bleed" columns once we scroll rightward.
            const columnWidths = Array(5).fill(LARGE_COLUMN_WIDTH);

            // create a container element to enforce a maximum viewport size
            // small enough to cause scrolling.
            const containerElement = document.createElement("div");
            containerElement.style.width = `${CONTAINER_WIDTH}px`;
            containerElement.style.height = `${CONTAINER_HEIGHT}px`;
            document.body.appendChild(containerElement);

            // need to mount directly into the DOM for this test to work
            let table: Table;
            const saveTable = (ref: Table) => (table = ref);
            const tableElement = harness.mount(
                <Table ref={saveTable} numRows={1} numFrozenColumns={1} columnWidths={columnWidths}>
                    <Column name="Column0" renderCell={renderCell} />
                    <Column name="Column1" renderCell={renderCell} />
                    <Column name="Column2" renderCell={renderCell} />
                    <Column name="Column3" renderCell={renderCell} />
                    <Column name="Column4" renderCell={renderCell} />
                </Table>,
            );

            // scroll the frozen column out of view in the MAIN quadrant,
            // and expect a non-zero height.
            table.scrollToRegion(Regions.column(columnWidths.length - 1));

            const quadrantSelector = `.${Classes.TABLE_QUADRANT_LEFT}`;
            const columnHeaderSelector = `${quadrantSelector} .${Classes.TABLE_COLUMN_HEADERS}`;
            const resizeHandleSelector = `${columnHeaderSelector} .${Classes.TABLE_RESIZE_HANDLE_TARGET}`;
            const frozenColumnResizeHandle = tableElement.find(resizeHandleSelector, FROZEN_COLUMN_INDEX);

            // double-click the frozen column's resize handle
            frozenColumnResizeHandle
                .mouse("mousedown")
                .mouse("mouseup", 10)
                .mouse("mousedown")
                .mouse("mouseup", 10);

            expect(table.state.columnWidths[0]).to.equal(EXPECTED_COLUMN_WIDTH);

            // clean up
            document.body.removeChild(containerElement);
        });

        function mountTable(tableProps: Partial<ITableProps> & object = {}) {
            return harness.mount(
                // set the row height so small so they can all fit in the viewport and be rendered
                <Table
                    defaultRowHeight={1}
                    isRowResizable={true}
                    minRowHeight={1}
                    numRows={10}
                    selectedRegions={[Regions.row(0, 1), Regions.row(4, 6), Regions.row(8)]}
                    {...tableProps}
                >
                    <Column renderCell={renderDummyCell} />
                    <Column renderCell={renderDummyCell} />
                    <Column renderCell={renderDummyCell} />
                </Table>,
            );
        }

        function getRowHeadersWrapper(table: ElementHarness) {
            return table.find(`.${Classes.TABLE_ROW_HEADERS}`);
        }

        function getResizeHandle(header: ElementHarness, index: number) {
            return header.find(`.${Classes.TABLE_RESIZE_HANDLE_TARGET}`, index);
        }
    });

    describe("Reordering", () => {
        const OLD_INDEX = 0;
        const NEW_INDEX = 1;
        const LENGTH = 2;
        const NUM_COLUMNS = 5;
        const NUM_ROWS = 5;

        // considerations:
        // - make the rows and columns fit exactly in the table dimensions; not trying to test scrolling.
        // - ensure the columns are wide enough to fit their reorder handle.
        const CONTAINER_WIDTH_IN_PX = 200;
        const CONTAINER_HEIGHT_IN_PX = 200;
        const ROW_HEIGHT_IN_PX = CONTAINER_HEIGHT_IN_PX / NUM_ROWS;
        const COLUMN_WIDTH_IN_PX = CONTAINER_WIDTH_IN_PX / NUM_COLUMNS;

        const OFFSET_X = (NEW_INDEX + LENGTH) * COLUMN_WIDTH_IN_PX;
        const OFFSET_Y = (NEW_INDEX + LENGTH) * ROW_HEIGHT_IN_PX;

        const onColumnsReordered = sinon.spy();
        const onRowsReordered = sinon.spy();
        const onSelection = sinon.spy();

        afterEach(() => {
            onColumnsReordered.reset();
            onRowsReordered.reset();
            onSelection.reset();
        });

        it("Shows preview guide and invokes callback when selected columns reordered", () => {
            const table = mountTable({
                isColumnReorderable: true,
                onColumnsReordered,
                selectedRegions: [Regions.column(OLD_INDEX, LENGTH - 1)],
            });
            const headerCell = getHeaderCell(getColumnHeadersWrapper(table), 0);
            const reorderHandle = getReorderHandle(headerCell);
            reorderHandle.mouse("mousedown").mouse("mousemove", getAdjustedOffsetX(OFFSET_X, reorderHandle));

            const guide = table.find(`.${Classes.TABLE_VERTICAL_GUIDE}`);
            expect(guide).to.exist;

            reorderHandle.mouse("mouseup", getAdjustedOffsetX(OFFSET_X, reorderHandle));
            expect(onColumnsReordered.called).to.be.true;
            expect(onColumnsReordered.calledWith(OLD_INDEX, NEW_INDEX, LENGTH)).to.be.true;
        });

        it("Shows preview guide and invokes callback when selected rows reordered", () => {
            const table = mountTable({
                isRowReorderable: true,
                onRowsReordered,
                selectedRegions: [Regions.row(OLD_INDEX, LENGTH - 1)],
            });
            const headerCell = getHeaderCell(getRowHeadersWrapper(table), 0);
            headerCell.mouse("mousedown").mouse("mousemove", 0, OFFSET_Y);

            const guide = table.find(`.${Classes.TABLE_HORIZONTAL_GUIDE}`);
            expect(guide).to.exist;

            headerCell.mouse("mouseup", 0, OFFSET_Y);
            expect(onRowsReordered.called).to.be.true;
            expect(onRowsReordered.calledWith(OLD_INDEX, NEW_INDEX, LENGTH)).to.be.true;
        });

        it("Reorders an unselected column and selects it afterward", () => {
            const table = mountTable({
                isColumnReorderable: true,
                onColumnsReordered,
                onSelection,
            });
            const headerCell = getHeaderCell(getColumnHeadersWrapper(table), 0);
            const reorderHandle = getReorderHandle(headerCell);
            reorderHandle
                .mouse("mousedown")
                .mouse("mousemove", getAdjustedOffsetX(OFFSET_X, reorderHandle))
                .mouse("mouseup", getAdjustedOffsetX(OFFSET_X, reorderHandle));
            expect(onColumnsReordered.called).to.be.true;
            expect(onSelection.firstCall.calledWith([Regions.column(0)]));
        });

        it("Doesn't work on rows if there is no selected region defined yet", () => {
            const table = mountTable({
                isColumnReorderable: true,
                onColumnsReordered,
            });
            getHeaderCell(getColumnHeadersWrapper(table), 0)
                .mouse("mousedown")
                .mouse("mousemove", OFFSET_X)
                .mouse("mouseup", OFFSET_X);
            expect(onColumnsReordered.called).to.be.false;
        });

        it("Clears all selections except the reordered column after reordering", () => {
            const table = mountTable({
                isColumnReorderable: true,
                onColumnsReordered,
                onSelection,
                selectedRegions: [Regions.column(2)], // some other column
            });
            const headerCell = getHeaderCell(getColumnHeadersWrapper(table), 0);
            const reorderHandle = getReorderHandle(headerCell);

            // now we can reorder the column one spot to the right
            const newIndex = 1;
            const length = 1;
            const offsetX = (newIndex + length) * COLUMN_WIDTH_IN_PX;
            const adjustedOffsetX = getAdjustedOffsetX(offsetX, reorderHandle);
            reorderHandle
                .mouse("mousedown")
                .mouse("mousemove", adjustedOffsetX)
                .mouse("mouseup", adjustedOffsetX);

            // called once on mousedown (to select column 0), once on mouseup (to move the selection)
            expect(onSelection.callCount).to.equal(2);
            expect(onSelection.getCall(1).args).to.deep.equal([[Regions.column(newIndex)]]);
        });

        function mountTable(props: Partial<ITableProps>) {
            const table = harness.mount(
                <div style={{ width: CONTAINER_WIDTH_IN_PX, height: CONTAINER_HEIGHT_IN_PX }}>
                    <Table
                        columnWidths={Array(NUM_COLUMNS).fill(COLUMN_WIDTH_IN_PX)}
                        numRows={NUM_ROWS}
                        rowHeights={Array(NUM_ROWS).fill(ROW_HEIGHT_IN_PX)}
                        {...props}
                    >
                        <Column renderCell={renderDummyCell} />
                        <Column renderCell={renderDummyCell} />
                        <Column renderCell={renderDummyCell} />
                        <Column renderCell={renderDummyCell} />
                        <Column renderCell={renderDummyCell} />
                    </Table>
                </div>,
            );
            return table;
        }

        function getColumnHeadersWrapper(table: ElementHarness) {
            return table.find(`.${Classes.TABLE_COLUMN_HEADERS}`);
        }

        function getRowHeadersWrapper(table: ElementHarness) {
            return table.find(`.${Classes.TABLE_ROW_HEADERS}`);
        }

        function getHeaderCell(headersWrapper: ElementHarness, index: number) {
            return headersWrapper.find(`.${Classes.TABLE_HEADER}`, index);
        }

        function getReorderHandle(header: ElementHarness) {
            return header.find(`.${Classes.TABLE_REORDER_HANDLE_TARGET}`);
        }

        function getAdjustedOffsetX(offsetX: number, reorderHandle: ElementHarness) {
            // adjust the x coordinate to account for the rendered width of the reorder handle
            return offsetX - reorderHandle.element.getBoundingClientRect().width;
        }
    });

    describe("Focused cell", () => {
        let onFocus: Sinon.SinonSpy;
        let onVisibleCellsChange: Sinon.SinonSpy;

        const NUM_ROWS = 3;
        const NUM_COLS = 3;

        // center the initial focus cell
        const DEFAULT_FOCUSED_CELL_COORDS: IFocusedCellCoordinates = { row: 1, col: 1 } as any;

        // Enzyme appears to render our Table at 60px high x 400px wide. make all rows and columns
        // the same size as the table to force scrolling no matter which direction we move the focus
        // cell.
        const ROW_HEIGHT = 60;
        const COL_WIDTH = 400;

        // make these values arbitrarily bigger than the table bounds
        const OVERSIZED_ROW_HEIGHT = 10000;
        const OVERSIZED_COL_WIDTH = 10000;

        beforeEach(() => {
            onFocus = sinon.spy();
            onVisibleCellsChange = sinon.spy();
        });

        it("removes the focused cell if enableFocus is reset to false", () => {
            const { component } = mountTable();
            const focusCellSelector = `.${Classes.TABLE_FOCUS_REGION}`;
            expect(component.find(focusCellSelector).exists()).to.be.true;
            component.setProps({ enableFocus: false });
            expect(component.find(focusCellSelector).exists()).to.be.false;
        });

        describe("moves a focus cell with arrow keys", () => {
            runFocusCellMoveTest("up", Keys.ARROW_UP, { row: 0, col: 1, focusSelectionIndex: 0 });
            runFocusCellMoveTest("down", Keys.ARROW_DOWN, { row: 2, col: 1, focusSelectionIndex: 0 });
            runFocusCellMoveTest("left", Keys.ARROW_LEFT, { row: 1, col: 0, focusSelectionIndex: 0 });
            runFocusCellMoveTest("right", Keys.ARROW_RIGHT, { row: 1, col: 2, focusSelectionIndex: 0 });

            it("doesn't move a focus cell if modifier key is pressed", () => {
                const { component } = mountTable();
                component.simulate("keyDown", createKeyEventConfig(component, "right", Keys.ARROW_RIGHT, true));
                expect(onFocus.called).to.be.false;
            });

            function runFocusCellMoveTest(key: string, keyCode: number, expectedCoords: IFocusedCellCoordinates) {
                it(key, () => {
                    const { component } = mountTable();
                    component.simulate("keyDown", createKeyEventConfig(component, key, keyCode));
                    expect(onFocus.called).to.be.true;
                    expect(onFocus.getCall(0).args[0]).to.deep.equal(expectedCoords);
                });
            }
        });

        describe("moves a focus cell internally with tab and enter", () => {
            function runFocusCellMoveInternalTest(
                name: string,
                key: string,
                keyCode: number,
                shiftKey: boolean,
                focusCellCoords: IFocusedCellCoordinates,
                expectedCoords: IFocusedCellCoordinates,
            ) {
                it(name, () => {
                    const selectedRegions: IRegion[] = [{ cols: [0, 1], rows: [0, 1] }, { cols: [2, 2], rows: [2, 2] }];
                    const tableHarness = mount(
                        <Table
                            numRows={5}
                            enableFocus={true}
                            focusedCell={focusCellCoords}
                            onFocus={onFocus}
                            selectedRegions={selectedRegions}
                        >
                            <Column name="Column0" renderCell={renderDummyCell} />
                            <Column name="Column1" renderCell={renderDummyCell} />
                            <Column name="Column2" renderCell={renderDummyCell} />
                            <Column name="Column3" renderCell={renderDummyCell} />
                            <Column name="Column4" renderCell={renderDummyCell} />
                        </Table>,
                    );
                    tableHarness.simulate("keyDown", createKeyEventConfig(tableHarness, key, keyCode, shiftKey));
                    expect(onFocus.args[0][0]).to.deep.equal(expectedCoords);
                });
            }
            runFocusCellMoveInternalTest(
                "moves a focus cell on tab",
                "tab",
                Keys.TAB,
                false,
                { row: 0, col: 0, focusSelectionIndex: 0 },
                { row: 0, col: 1, focusSelectionIndex: 0 },
            );
            runFocusCellMoveInternalTest(
                "wraps a focus cell around with tab",
                "tab",
                Keys.TAB,
                false,
                { row: 0, col: 1, focusSelectionIndex: 0 },
                { row: 1, col: 0, focusSelectionIndex: 0 },
            );
            runFocusCellMoveInternalTest(
                "moves a focus cell to next region with tab",
                "tab",
                Keys.TAB,
                false,
                { row: 1, col: 1, focusSelectionIndex: 0 },
                { row: 2, col: 2, focusSelectionIndex: 1 },
            );

            runFocusCellMoveInternalTest(
                "moves a focus cell on enter",
                "enter",
                Keys.ENTER,
                false,
                { row: 0, col: 0, focusSelectionIndex: 0 },
                { row: 1, col: 0, focusSelectionIndex: 0 },
            );
            runFocusCellMoveInternalTest(
                "wraps a focus cell around with enter",
                "enter",
                Keys.ENTER,
                false,
                { row: 1, col: 0, focusSelectionIndex: 0 },
                { row: 0, col: 1, focusSelectionIndex: 0 },
            );
            runFocusCellMoveInternalTest(
                "moves a focus cell to next region with enter",
                "enter",
                Keys.ENTER,
                false,
                { row: 1, col: 1, focusSelectionIndex: 0 },
                { row: 2, col: 2, focusSelectionIndex: 1 },
            );

            runFocusCellMoveInternalTest(
                "moves a focus cell on shift+tab",
                "tab",
                Keys.TAB,
                true,
                { row: 0, col: 1, focusSelectionIndex: 0 },
                { row: 0, col: 0, focusSelectionIndex: 0 },
            );
            runFocusCellMoveInternalTest(
                "wraps a focus cell around with shift+tab",
                "tab",
                Keys.TAB,
                true,
                { row: 1, col: 0, focusSelectionIndex: 0 },
                { row: 0, col: 1, focusSelectionIndex: 0 },
            );
            runFocusCellMoveInternalTest(
                "moves a focus cell to prev region with shift+tab",
                "tab",
                Keys.TAB,
                true,
                { row: 0, col: 0, focusSelectionIndex: 0 },
                { row: 2, col: 2, focusSelectionIndex: 1 },
            );

            runFocusCellMoveInternalTest(
                "moves a focus cell on shift+enter",
                "enter",
                Keys.ENTER,
                true,
                { row: 1, col: 0, focusSelectionIndex: 0 },
                { row: 0, col: 0, focusSelectionIndex: 0 },
            );
            runFocusCellMoveInternalTest(
                "wraps a focus cell around with shift+enter",
                "enter",
                Keys.ENTER,
                true,
                { row: 0, col: 1, focusSelectionIndex: 0 },
                { row: 1, col: 0, focusSelectionIndex: 0 },
            );
            runFocusCellMoveInternalTest(
                "moves a focus cell to next region with shift+enter",
                "enter",
                Keys.ENTER,
                true,
                { row: 0, col: 0, focusSelectionIndex: 0 },
                { row: 2, col: 2, focusSelectionIndex: 1 },
            );
        });

        describe("scrolls viewport to fit focused cell after moving it", () => {
            runFocusCellViewportScrollTest("up", Keys.ARROW_UP, "top", ROW_HEIGHT * 0);
            runFocusCellViewportScrollTest("down", Keys.ARROW_DOWN, "top", ROW_HEIGHT * 2);
            runFocusCellViewportScrollTest("left", Keys.ARROW_LEFT, "left", COL_WIDTH * 0);
            runFocusCellViewportScrollTest("right", Keys.ARROW_RIGHT, "left", COL_WIDTH * 2);

            it("keeps top edge of oversized focus cell in view when moving left and right", () => {
                // subtract one pixel to avoid clipping the focus cell
                const EXPECTED_TOP_OFFSET = OVERSIZED_ROW_HEIGHT * 1 - 1;

                const { component } = mountTable(OVERSIZED_ROW_HEIGHT, OVERSIZED_COL_WIDTH);
                const keyEventConfig = createKeyEventConfig(component, "right", Keys.ARROW_RIGHT);

                // move right twice, expecting the viewport to snap to the top of the oversize
                // focused cell both times

                component.simulate("keyDown", keyEventConfig);
                expect(component.state("viewportRect").top).to.equal(EXPECTED_TOP_OFFSET);
                component.simulate("keyDown", keyEventConfig);
                expect(component.state("viewportRect").top).to.equal(EXPECTED_TOP_OFFSET);
            });

            it("keeps left edge of oversized focus cell in view when moving up and down", () => {
                // subtract one pixel to avoid clipping the focus cell
                const EXPECTED_LEFT_OFFSET = OVERSIZED_COL_WIDTH * 1 - 1;

                const { component } = mountTable(OVERSIZED_ROW_HEIGHT, OVERSIZED_COL_WIDTH);
                const keyEventConfig = createKeyEventConfig(component, "down", Keys.ARROW_DOWN);

                // move down twice, expecting the viewport to snap to the left of the oversize
                // focused cell both times

                component.simulate("keyDown", keyEventConfig);
                expect(component.state("viewportRect").left).to.equal(EXPECTED_LEFT_OFFSET);
                component.simulate("keyDown", keyEventConfig);
                expect(component.state("viewportRect").left).to.equal(EXPECTED_LEFT_OFFSET);
            });

            function runFocusCellViewportScrollTest(
                key: string,
                keyCode: number,
                attrToCheck: "top" | "left",
                expectedOffset: number,
            ) {
                it(key, () => {
                    const { component } = mountTable();
                    component.simulate("keyDown", createKeyEventConfig(component, key, keyCode));
                    expect(component.state("viewportRect")[attrToCheck]).to.equal(expectedOffset);
                    expect(onVisibleCellsChange.calledThrice).to.be.true;

                    const rowIndices: IRowIndices = { rowIndexStart: 0, rowIndexEnd: NUM_ROWS - 1 };
                    const columnIndices: IColumnIndices = { columnIndexStart: 0, columnIndexEnd: NUM_COLS - 1 };
                    expect(onVisibleCellsChange.lastCall.calledWith(rowIndices, columnIndices)).to.be.true;
                });
            }
        });

        function mountTable(rowHeight = ROW_HEIGHT, colWidth = COL_WIDTH) {
            const attachTo = document.createElement("div");
            // need to `.fill` with some explicit value so that mapping will work, apparently
            const columns = Array(NUM_COLS)
                .fill(undefined)
                .map((_, i) => <Column key={i} renderCell={renderDummyCell} />);
            const component = mount(
                <Table
                    columnWidths={Array(NUM_ROWS).fill(colWidth)}
                    enableFocus={true}
                    focusedCell={DEFAULT_FOCUSED_CELL_COORDS}
                    onFocus={onFocus}
                    onVisibleCellsChange={onVisibleCellsChange}
                    rowHeights={Array(NUM_ROWS).fill(rowHeight)}
                    numRows={NUM_ROWS}
                >
                    {columns}
                </Table>,
                { attachTo },
            );

            // center the viewport on the focused cell
            const viewportLeft = DEFAULT_FOCUSED_CELL_COORDS.col * COL_WIDTH;
            const viewportTop = DEFAULT_FOCUSED_CELL_COORDS.row * ROW_HEIGHT;
            const viewportWidth = COL_WIDTH;
            const viewportHeight = ROW_HEIGHT;
            component.setState({ viewportRect: new Rect(viewportLeft, viewportTop, viewportWidth, viewportHeight) });

            return { attachTo, component };
        }

        function createKeyEventConfig(
            component: ReactWrapper<any, any>,
            key: string,
            keyCode: number,
            shiftKey = false,
        ) {
            const eventConfig = {
                key,
                keyCode,
                preventDefault: () => {
                    /* Empty */
                },
                shiftKey,
                stopPropagation: () => {
                    /* Empty */
                },
                target: (component as any).getNode(), // `getNode` is a real Enzyme method, just not in the typings?
                which: keyCode,
            };
            return {
                eventConfig,
                nativeEvent: eventConfig,
            };
        }
    });

    describe("Manually scrolling while drag-selecting", () => {
        const ACTIVATION_CELL_COORDS: ICellCoordinates = { row: 1, col: 1 };

        const NUM_ROWS = 3;
        const NUM_COLS = 3;

        const ROW_HEIGHT = 60;
        const COL_WIDTH = 400;

        let onSelection: Sinon.SinonSpy;

        beforeEach(() => {
            onSelection = sinon.spy();
        });

        runTest("up");
        runTest("down");
        runTest("left");
        runTest("right");

        function runTest(direction: "up" | "down" | "left" | "right") {
            // create a new object so that tests don't keep mutating the same object instance.
            const { row, col } = ACTIVATION_CELL_COORDS;
            const nextCellCoords = { row, col };

            if (direction === "up") {
                nextCellCoords.col -= 1;
            } else if (direction === "down") {
                nextCellCoords.col += 1;
            } else if (direction === "left") {
                nextCellCoords.row -= 1;
            } else {
                // if direction === "right"
                nextCellCoords.row += 1;
            }

            it(`should keep the same activation coordinates when manually scrolling ${direction}`, () => {
                assertActivationCellUnaffected(nextCellCoords);
            });
        }

        function assertActivationCellUnaffected(nextCellCoords: ICellCoordinates) {
            // setup
            const table = mountTable();
            const { grid, locator } = table.instance() as Table;
            const prevViewportRect = locator.getViewportRect();

            // get native DOM nodes
            const tableNode = ReactDOM.findDOMNode(table.instance());
            const tableBodySelector = `.${Classes.TABLE_BODY_VIRTUAL_CLIENT}`;
            const tableBodyNode = ReactDOM.findDOMNode(tableNode.querySelector(tableBodySelector));

            // trigger a drag-selection starting at the center of the activation cell
            const activationX = COL_WIDTH / 2;
            const activationY = ROW_HEIGHT / 2;
            dispatchMouseEvent(tableBodyNode, "mousedown", activationX, activationY);

            // scroll the next cell into view
            updateLocatorElements(
                table,
                grid.getCumulativeWidthBefore(nextCellCoords.col),
                grid.getCumulativeHeightBefore(nextCellCoords.row),
                prevViewportRect.height,
                prevViewportRect.width,
            );

            // move the mouse a little to trigger a selection update
            dispatchMouseEvent(document, "mousemove", activationX, activationY + 1);

            // verify the selection is still anchored to the activation cell
            // (onSelection will now have been called after the "mousedown" and after the "mousemove")
            const selections = onSelection.getCall(1).args[0];
            const selection = selections[0];

            const selectedCols = selection.cols;
            const selectedRows = selection.rows;

            const expectedCols = sortInterval(ACTIVATION_CELL_COORDS.col, nextCellCoords.col);
            const expectedRows = sortInterval(ACTIVATION_CELL_COORDS.row, nextCellCoords.row);

            expect(CoreUtils.arraysEqual(selectedCols, expectedCols)).to.be.true;
            expect(CoreUtils.arraysEqual(selectedRows, expectedRows)).to.be.true;
        }

        function mountTable(rowHeight = ROW_HEIGHT, colWidth = COL_WIDTH) {
            // need to explicitly `.fill` a new array with empty values for mapping to work
            const defineColumn = (_unused: any, i: number) => <Column key={i} renderCell={renderDummyCell} />;
            const columns = Array(NUM_COLS)
                .fill(undefined)
                .map(defineColumn);

            const table = mount(
                <Table
                    columnWidths={Array(NUM_COLS).fill(colWidth)}
                    onSelection={onSelection}
                    rowHeights={Array(NUM_ROWS).fill(rowHeight)}
                    numRows={NUM_ROWS}
                >
                    {columns}
                </Table>,
            );

            // scroll to the activation cell
            updateLocatorElements(
                table,
                ACTIVATION_CELL_COORDS.col * colWidth,
                ACTIVATION_CELL_COORDS.row * rowHeight,
                colWidth,
                rowHeight,
            );

            return table;
        }

        function sortInterval(coord1: number, coord2: number) {
            return coord1 > coord2 ? [coord2, coord1] : [coord1, coord2];
        }
    });

    describe("Autoscrolling when rows/columns decrease in count or size", () => {
        const COL_WIDTH = 400;
        const ROW_HEIGHT = 60;

        const NUM_COLS = 10;
        const NUM_ROWS = 10;

        const UPDATED_NUM_COLS = NUM_COLS - 1;
        const UPDATED_NUM_ROWS = NUM_ROWS - 1;

        // small, 1px tweaks that keep the entire table larger than the viewport but that also
        // require autoscrolling
        const UPDATED_COL_WIDTH = COL_WIDTH - 1;
        const UPDATED_ROW_HEIGHT = ROW_HEIGHT - 1;

        let onVisibleCellsChange: Sinon.SinonSpy;

        beforeEach(() => {
            onVisibleCellsChange = sinon.spy();
        });

        it("when column count decreases", () => {
            const table = mountTable(NUM_COLS, 1);
            scrollTable(table, (NUM_COLS - 1) * COL_WIDTH, 0, () => {
                const newColumns = renderColumns(UPDATED_NUM_COLS);
                table.setProps({ children: newColumns });

                // the viewport should have auto-scrolled to fit the last column in view
                const viewportRect = table.state("viewportRect");
                expect(viewportRect.left).to.equal(UPDATED_NUM_COLS * COL_WIDTH - viewportRect.width);

                // this callback is invoked more than necessary in response to a single change.
                // feel free to tighten the screws and reduce this expected count.
                expect(onVisibleCellsChange.callCount).to.equal(5);
            });
        });

        it("when row count decreases", () => {
            const table = mountTable(1, NUM_ROWS);
            scrollTable(table, 0, (NUM_ROWS - 1) * ROW_HEIGHT, () => {
                table.setProps({ numRows: UPDATED_NUM_ROWS });

                const viewportRect = table.state("viewportRect");
                expect(viewportRect.top).to.equal(UPDATED_NUM_ROWS * ROW_HEIGHT - viewportRect.height);
                expect(onVisibleCellsChange.callCount).to.equal(5);
            });
        });

        it("when column widths decrease", () => {
            const table = mountTable(NUM_COLS, 1);
            scrollTable(table, (NUM_COLS - 1) * COL_WIDTH, 0, () => {
                table.setProps({ columnWidths: Array(NUM_COLS).fill(UPDATED_COL_WIDTH) });

                const viewportRect = table.state("viewportRect");
                expect(viewportRect.left).to.equal(NUM_COLS * UPDATED_COL_WIDTH - viewportRect.width);
                expect(onVisibleCellsChange.callCount).to.equal(5);
            });
        });

        it("when row heights decrease", () => {
            const table = mountTable(1, NUM_ROWS);
            scrollTable(table, 0, (NUM_ROWS - 1) * ROW_HEIGHT, () => {
                table.setProps({ rowHeights: Array(NUM_ROWS).fill(UPDATED_ROW_HEIGHT) });

                const viewportRect = table.state("viewportRect");
                expect(viewportRect.top).to.equal(NUM_ROWS * UPDATED_ROW_HEIGHT - viewportRect.height);
                expect(onVisibleCellsChange.callCount).to.equal(5);
            });
        });

        function mountTable(numCols: number, numRows: number) {
            return mount(
                <Table
                    columnWidths={Array(numCols).fill(COL_WIDTH)}
                    rowHeights={Array(numRows).fill(ROW_HEIGHT)}
                    numRows={numRows}
                    onVisibleCellsChange={onVisibleCellsChange}
                >
                    {renderColumns(numCols)}
                </Table>,
            );
        }

        function renderColumns(numCols: number) {
            return Array(numCols)
                .fill(undefined)
                .map(renderColumn);
        }

        function renderColumn(_unused: any, i: number) {
            return <Column key={i} renderCell={renderDummyCell} />;
        }

        function scrollTable(
            table: ReactWrapper<any, {}>,
            scrollLeft: number,
            scrollTop: number,
            callback: () => void,
        ) {
            // make the viewport small enough to fit only one cell
            updateLocatorElements(table, scrollLeft, scrollTop, COL_WIDTH, ROW_HEIGHT);
            table
                .find(TableQuadrant)
                .first()
                .simulate("scroll");

            // delay to next frame to let throttled scroll logic execute first
            delayToNextFrame(callback);
        }
    });

    describe("Validation", () => {
        describe("on mount", () => {
            describe("errors", () => {
                it("throws an error if numRows < 0", () => {
                    const renderErroneousTable = () => shallow(<Table numRows={-1} />);
                    expect(renderErroneousTable).to.throw(Errors.TABLE_NUM_ROWS_NEGATIVE);
                });

                it("throws an error if numFrozenRows < 0", () => {
                    const renderErroneousTable = () => shallow(<Table numFrozenRows={-1} />);
                    expect(renderErroneousTable).to.throw(Errors.TABLE_NUM_FROZEN_ROWS_NEGATIVE);
                });

                it("throws an error if numFrozenColumns < 0", () => {
                    const renderErroneousTable = () => shallow(<Table numFrozenColumns={-1} />);
                    expect(renderErroneousTable).to.throw(Errors.TABLE_NUM_FROZEN_COLUMNS_NEGATIVE);
                });

                it("throws an error if rowHeights.length !== numRows", () => {
                    const renderErroneousTable = () => shallow(<Table numRows={3} rowHeights={[1, 2]} />);
                    expect(renderErroneousTable).to.throw(Errors.TABLE_NUM_ROWS_ROW_HEIGHTS_MISMATCH);
                });

                it("throws an error if columnWidths.length !== number of <Column>s", () => {
                    const renderErroneousTable = () => {
                        shallow(
                            <Table columnWidths={[1, 2]}>
                                <Column />
                                <Column />
                                <Column />
                            </Table>,
                        );
                    };
                    expect(renderErroneousTable).to.throw(Errors.TABLE_NUM_COLUMNS_COLUMN_WIDTHS_MISMATCH);
                });

                it("throws an error if a non-<Column> child is provided", () => {
                    // we were printing a warning before, but the Table would
                    // eventually throw an error from deep inside, so might as
                    // well just throw a clear error at the outset.
                    const renderErroneousTable = () => {
                        shallow(<Table>I'm a string, not a column</Table>);
                    };
                    expect(renderErroneousTable).to.throw(Errors.TABLE_NON_COLUMN_CHILDREN_WARNING);
                });
            });

            describe("warnings", () => {
                let consoleWarn: Sinon.SinonSpy;

                before(() => {
                    consoleWarn = sinon.spy(console, "warn");
                });

                afterEach(() => {
                    consoleWarn.reset();
                });

                after(() => {
                    consoleWarn.restore();
                });

                it("should print a warning when numFrozenRows > numRows", () => {
                    shallow(<Table numRows={1} numFrozenRows={2} />);
                    expect(consoleWarn.calledOnce);
                    expect(consoleWarn.firstCall.args).to.deep.equal([Errors.TABLE_NUM_FROZEN_ROWS_BOUND_WARNING]);
                });

                it("should print a warning when numFrozenColumns > num <Column>s", () => {
                    shallow(
                        <Table numFrozenColumns={2}>
                            <Column />
                        </Table>,
                    );
                    expect(consoleWarn.calledOnce);
                    expect(consoleWarn.firstCall.args).to.deep.equal([Errors.TABLE_NUM_FROZEN_COLUMNS_BOUND_WARNING]);
                });
            });
        });

        describe("on update", () => {
            describe("errors", () => {
                it("on numRows update, throws an error if numRows < 0", () => {
                    const table = shallow(<Table numRows={1} />);
                    const updateErroneously = () => table.setProps({ numRows: -1 });
                    expect(updateErroneously).to.throw(Errors.TABLE_NUM_ROWS_NEGATIVE);
                });

                it("on numFrozenRows update, throws an error if numFrozenRows < 0", () => {
                    const table = shallow(<Table numFrozenRows={0} />);
                    const updateErroneously = () => table.setProps({ numFrozenRows: -1 });
                    expect(updateErroneously).to.throw(Errors.TABLE_NUM_FROZEN_ROWS_NEGATIVE);
                });

                it("on numFrozenColumns update, throws an error if numFrozenColumns < 0", () => {
                    const table = shallow(<Table numFrozenColumns={0} />);
                    const updateErroneously = () => table.setProps({ numFrozenColumns: -1 });
                    expect(updateErroneously).to.throw(Errors.TABLE_NUM_FROZEN_COLUMNS_NEGATIVE);
                });

                it("on numRows update, throws an error if rowHeights.length !== numRows", () => {
                    const table = shallow(<Table numRows={3} rowHeights={[1, 2, 3]} />);
                    const updateErroneously = () => table.setProps({ numRows: 4 });
                    expect(updateErroneously).to.throw(Errors.TABLE_NUM_ROWS_ROW_HEIGHTS_MISMATCH);
                });

                it("on rowHeights update, throws an error if rowHeights.length !== numRows", () => {
                    const table = shallow(<Table numRows={3} rowHeights={[1, 2, 3]} />);
                    const updateErroneously = () => table.setProps({ rowHeights: [1, 2, 3, 4] });
                    expect(updateErroneously).to.throw(Errors.TABLE_NUM_ROWS_ROW_HEIGHTS_MISMATCH);
                });

                it("on children update, throws an error if columnWidths.length !== number of <Column>s", () => {
                    const table = shallow(
                        <Table columnWidths={[1, 2, 3]}>
                            <Column />
                            <Column />
                            <Column />
                        </Table>,
                    );
                    const updateErroneously = () => table.setProps({ children: [<Column />, <Column />] });
                    expect(updateErroneously).to.throw(Errors.TABLE_NUM_COLUMNS_COLUMN_WIDTHS_MISMATCH);
                });

                it("on columnWidths update, throws an error if columnWidths.length !== number of <Column>s", () => {
                    const table = shallow(
                        <Table columnWidths={[1, 2, 3]}>
                            <Column />
                            <Column />
                            <Column />
                        </Table>,
                    );
                    const updateErroneously = () => table.setProps({ columnWidths: [1, 2, 3, 4] });
                    expect(updateErroneously).to.throw(Errors.TABLE_NUM_COLUMNS_COLUMN_WIDTHS_MISMATCH);
                });

                it("on children update, throws an error if a non-<Column> child is provided", () => {
                    const table = shallow(
                        <Table>
                            <Column />
                        </Table>,
                    );
                    const updateErroneously = () => table.setProps({ children: [<Cell />] });
                    expect(updateErroneously).to.throw(Errors.TABLE_NON_COLUMN_CHILDREN_WARNING);
                });
            });

            describe("warnings", () => {
                let consoleWarn: Sinon.SinonSpy;

                before(() => {
                    consoleWarn = sinon.spy(console, "warn");
                });

                afterEach(() => {
                    consoleWarn.reset();
                });

                after(() => {
                    consoleWarn.restore();
                });

                it("on numFrozenRows update, should print a warning when numFrozenRows > numRows", () => {
                    const table = shallow(<Table numRows={1} numFrozenRows={1} />);
                    expect(consoleWarn.called).to.be.false;
                    table.setProps({ numFrozenRows: 2 });
                    expect(consoleWarn.calledOnce).to.be.true;
                    expect(consoleWarn.firstCall.args).to.deep.equal([Errors.TABLE_NUM_FROZEN_ROWS_BOUND_WARNING]);
                });

                it("on numRows update, should print a warning when numFrozenRows > numRows", () => {
                    const table = shallow(<Table numRows={1} numFrozenRows={1} />);
                    expect(consoleWarn.called).to.be.false;
                    table.setProps({ numRows: 0 });
                    expect(consoleWarn.calledOnce).to.be.true;
                    expect(consoleWarn.firstCall.args).to.deep.equal([Errors.TABLE_NUM_FROZEN_ROWS_BOUND_WARNING]);
                });

                it("on numFrozenColumns update, should print a warning when numFrozenColumns > num <Column>s", () => {
                    const table = shallow(
                        <Table numFrozenColumns={1}>
                            <Column />
                        </Table>,
                    );
                    expect(consoleWarn.called).to.be.false;
                    table.setProps({ numFrozenColumns: 2 });
                    expect(consoleWarn.calledOnce).to.be.true;
                    expect(consoleWarn.firstCall.args).to.deep.equal([Errors.TABLE_NUM_FROZEN_COLUMNS_BOUND_WARNING]);
                });

                it("on children update, should print a warning when numFrozenColumns > num <Column>s", () => {
                    const table = shallow(
                        <Table numFrozenColumns={1}>
                            <Column />
                        </Table>,
                    );
                    expect(consoleWarn.called).to.be.false;
                    table.setProps({ children: [] });
                    expect(consoleWarn.calledOnce).to.be.true;
                    expect(consoleWarn.firstCall.args).to.deep.equal([Errors.TABLE_NUM_FROZEN_COLUMNS_BOUND_WARNING]);
                });

                it("should print a warning when numFrozenColumns > num <Column>s", () => {
                    shallow(
                        <Table numFrozenColumns={2}>
                            <Column />
                        </Table>,
                    );
                    expect(consoleWarn.calledOnce);
                    expect(consoleWarn.firstCall.args).to.deep.equal([Errors.TABLE_NUM_FROZEN_COLUMNS_BOUND_WARNING]);
                });
            });
        });
    });

    xit("Accepts a sparse array of column widths", () => {
        const table = harness.mount(
            <Table columnWidths={[null, 200, null]} defaultColumnWidth={75}>
                <Column />
                <Column />
                <Column />
            </Table>,
        );

        const columns = table.find(`.${Classes.TABLE_COLUMN_HEADERS}`);
        expect(columns.find(`.${Classes.TABLE_HEADER}`, 0).bounds().width).to.equal(75);
        expect(columns.find(`.${Classes.TABLE_HEADER}`, 1).bounds().width).to.equal(200);
        expect(columns.find(`.${Classes.TABLE_HEADER}`, 2).bounds().width).to.equal(75);
    });

    xdescribe("Persists column widths", () => {
        const expectHeaderWidth = (table: ElementHarness, index: number, width: number) => {
            expect(
                table
                    .find(`.${Classes.TABLE_COLUMN_HEADERS}`)
                    .find(`.${Classes.TABLE_HEADER}`, index)
                    .bounds().width,
            ).to.equal(width);
        };

        it("remembers width for columns that have an ID", () => {
            const columns = [<Column key="a" id="a" />, <Column key="b" id="b" />, <Column key="c" id="c" />];

            // default and explicit sizes sizes
            const table0 = harness.mount(
                <Table columnWidths={[null, 100, null]} defaultColumnWidth={50}>
                    {columns}
                </Table>,
            );
            expectHeaderWidth(table0, 0, 50);
            expectHeaderWidth(table0, 1, 100);
            expectHeaderWidth(table0, 2, 50);

            // removing explicit size props
            const table1 = harness.mount(<Table>{columns}</Table>);
            expectHeaderWidth(table1, 0, 50);
            expectHeaderWidth(table1, 1, 100);
            expectHeaderWidth(table1, 2, 50);

            // re-arranging and REMOVING columns
            const table2 = harness.mount(<Table>{[columns[1], columns[0]]}</Table>);
            expectHeaderWidth(table2, 0, 100);
            expectHeaderWidth(table2, 1, 50);

            // re-arranging and ADDING columns
            const table3 = harness.mount(<Table defaultColumnWidth={51}>{columns}</Table>);
            expectHeaderWidth(table3, 0, 50);
            expectHeaderWidth(table3, 1, 100);
            expectHeaderWidth(table3, 2, 51);
        });

        it("remembers width for columns without IDs using index", () => {
            const columns = [<Column key="a" id="a" />, <Column key="b" />, <Column key="c" />];

            // default and explicit sizes sizes
            const table0 = harness.mount(
                <Table columnWidths={[null, 100, null]} defaultColumnWidth={50}>
                    {columns}
                </Table>,
            );
            expectHeaderWidth(table0, 0, 50);
            expectHeaderWidth(table0, 1, 100);
            expectHeaderWidth(table0, 2, 50);

            // removing explicit size props
            const table1 = harness.mount(<Table>{columns}</Table>);
            expectHeaderWidth(table1, 0, 50);
            expectHeaderWidth(table1, 1, 100);
            expectHeaderWidth(table1, 2, 50);

            // re-arranging and REMOVING columns
            const table2 = harness.mount(<Table>{[columns[1], columns[0]]}</Table>);
            expectHeaderWidth(table2, 0, 50); // <= difference when no IDs
            expectHeaderWidth(table2, 1, 50);

            // re-arranging and ADDING columns
            const table3 = harness.mount(<Table defaultColumnWidth={51}>{columns}</Table>);
            expectHeaderWidth(table3, 0, 50);
            expectHeaderWidth(table3, 1, 50); // <= difference when no IDs
            expectHeaderWidth(table3, 2, 51);
        });
    });

    function renderDummyCell() {
        return <Cell>gg</Cell>;
    }

    function updateLocatorElements(
        table: ReactWrapper<any, {}>,
        scrollLeft: number,
        scrollTop: number,
        clientWidth: number,
        clientHeight: number,
    ) {
        const locator = (table.instance() as any).locator;
        const baseStyles = { clientHeight, clientWidth };

        locator.scrollContainerElement = {
            ...baseStyles,
            getBoundingClientRect: () => ({ left: 0, top: 0 }),
            scrollLeft,
            scrollTop,
        };

        const rowHeadersElement = table.getDOMNode().querySelector(`.${Classes.TABLE_ROW_HEADERS}`) as HTMLElement;
        const rowHeaderWidth = rowHeadersElement == null ? 0 : parseInt(rowHeadersElement.style.width, 10);

        // the scrollContainerElement *contains* the cellContainerElement, so
        // when we scroll the former, the latter's bounding rect offsets change
        // commensurately.
        locator.cellContainerElement = {
            ...baseStyles,
            getBoundingClientRect: () => ({ left: rowHeaderWidth - scrollLeft, top: 0 - scrollTop }),
        };
    }

    function delayToNextFrame(callback: () => void) {
        setTimeout(callback);
    }
});
