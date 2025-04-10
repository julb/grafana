import { SceneGridItemLike, SceneGridRow, SceneObjectBase, SceneObjectState, VizPanel } from '@grafana/scenes';
import { DashboardV2Spec } from '@grafana/schema/dist/esm/schema/dashboard/v2alpha0';
import { t } from 'app/core/internationalization';

import {
  NewObjectAddedToCanvasEvent,
  ObjectRemovedFromCanvasEvent,
  ObjectsReorderedOnCanvasEvent,
} from '../../edit-pane/shared';
import { serializeRowsLayout } from '../../serialization/layoutSerializers/RowsLayoutSerializer';
import { isClonedKey } from '../../utils/clone';
import { dashboardSceneGraph } from '../../utils/dashboardSceneGraph';
import { DashboardGridItem } from '../layout-default/DashboardGridItem';
import { DefaultGridLayoutManager } from '../layout-default/DefaultGridLayoutManager';
import { RowRepeaterBehavior } from '../layout-default/RowRepeaterBehavior';
import { TabsLayoutManager } from '../layout-tabs/TabsLayoutManager';
import { DashboardLayoutManager } from '../types/DashboardLayoutManager';
import { LayoutRegistryItem } from '../types/LayoutRegistryItem';

import { RowItem } from './RowItem';
import { RowItemRepeaterBehavior } from './RowItemRepeaterBehavior';
import { RowLayoutManagerRenderer } from './RowsLayoutManagerRenderer';

interface RowsLayoutManagerState extends SceneObjectState {
  rows: RowItem[];
}

export class RowsLayoutManager extends SceneObjectBase<RowsLayoutManagerState> implements DashboardLayoutManager {
  public static Component = RowLayoutManagerRenderer;

  public readonly isDashboardLayoutManager = true;

  public static readonly descriptor: LayoutRegistryItem = {
    get name() {
      return t('dashboard.rows-layout.name', 'Rows');
    },
    get description() {
      return t('dashboard.rows-layout.description', 'Collapsable panel groups with headings');
    },
    id: 'RowsLayout',
    createFromLayout: RowsLayoutManager.createFromLayout,
    isGridLayout: false,
  };

  public serialize(): DashboardV2Spec['layout'] {
    return serializeRowsLayout(this);
  }

  public readonly descriptor = RowsLayoutManager.descriptor;

  public addPanel(vizPanel: VizPanel) {
    // Try to add new panels to the selected row
    const selectedRows = dashboardSceneGraph.getAllSelectedObjects(this).filter((obj) => obj instanceof RowItem);
    if (selectedRows.length > 0) {
      return selectedRows.forEach((row) => row.onAddPanel(vizPanel));
    }

    // If we don't have selected row add it to the first row
    if (this.state.rows.length > 0) {
      return this.state.rows[0].onAddPanel(vizPanel);
    }

    // Otherwise fallback to adding a new row and a panel
    this.addNewRow();
    this.state.rows[this.state.rows.length - 1].onAddPanel(vizPanel);
  }

  public getVizPanels(): VizPanel[] {
    const panels: VizPanel[] = [];

    for (const row of this.state.rows) {
      const innerPanels = row.getLayout().getVizPanels();
      panels.push(...innerPanels);
    }

    return panels;
  }

  public cloneLayout(ancestorKey: string, isSource: boolean): DashboardLayoutManager {
    throw new Error('Method not implemented.');
  }

  public duplicate(): DashboardLayoutManager {
    const newRows = this.state.rows.map((row) => row.duplicate());
    return this.clone({ rows: newRows, key: undefined });
  }

  public duplicateRow(row: RowItem) {
    const newRow = row.duplicate();
    this.setState({ rows: [...this.state.rows, newRow] });
    this.publishEvent(new NewObjectAddedToCanvasEvent(newRow), true);
  }

  public addNewRow(): RowItem {
    const row = new RowItem({ isNew: true });
    this.setState({ rows: [...this.state.rows, row] });
    this.publishEvent(new NewObjectAddedToCanvasEvent(row), true);
    return row;
  }

  public editModeChanged(isEditing: boolean) {
    this.state.rows.forEach((row) => row.getLayout().editModeChanged?.(isEditing));
  }

  public activateRepeaters() {
    this.state.rows.forEach((row) => {
      if (!row.isActive) {
        row.activate();
      }

      const behavior = (row.state.$behaviors ?? []).find((b) => b instanceof RowItemRepeaterBehavior);

      if (!behavior?.isActive) {
        behavior?.activate();
      }

      row.getLayout().activateRepeaters?.();
    });
  }

  public addRowAbove(row: RowItem): RowItem {
    const index = this.state.rows.indexOf(row);
    const newRow = new RowItem({ isNew: true });
    const newRows = [...this.state.rows];

    newRows.splice(index, 0, newRow);

    this.setState({ rows: newRows });
    this.publishEvent(new NewObjectAddedToCanvasEvent(newRow), true);

    return newRow;
  }

  public addRowBelow(row: RowItem): RowItem {
    const rows = this.state.rows;
    let index = rows.indexOf(row);

    // Be sure we don't add a row between an original row and one of its clones
    while (rows[index + 1] && isClonedKey(rows[index + 1].state.key!)) {
      index = index + 1;
    }

    const newRow = new RowItem({ isNew: true });
    const newRows = [...this.state.rows];

    newRows.splice(index + 1, 0, newRow);

    this.setState({ rows: newRows });
    this.publishEvent(new NewObjectAddedToCanvasEvent(newRow), true);

    return newRow;
  }

  public removeRow(row: RowItem) {
    const rows = this.state.rows.filter((r) => r !== row);
    this.setState({ rows: rows.length === 0 ? [new RowItem()] : rows });
    this.publishEvent(new ObjectRemovedFromCanvasEvent(row), true);
  }

  public moveRowUp(row: RowItem) {
    const rows = [...this.state.rows];
    const originalIndex = rows.indexOf(row);

    if (originalIndex === 0) {
      return;
    }

    let moveToIndex = originalIndex - 1;

    // Be sure we don't add a row between an original row and one of its clones
    while (rows[moveToIndex] && isClonedKey(rows[moveToIndex].state.key!)) {
      moveToIndex = moveToIndex - 1;
    }

    rows.splice(originalIndex, 1);
    rows.splice(moveToIndex, 0, row);
    this.setState({ rows });
    this.publishEvent(new ObjectsReorderedOnCanvasEvent(this), true);
  }

  public moveRowDown(row: RowItem) {
    const rows = [...this.state.rows];
    const originalIndex = rows.indexOf(row);

    if (originalIndex === rows.length - 1) {
      return;
    }

    let moveToIndex = originalIndex + 1;

    // Be sure we don't add a row between an original row and one of its clones
    while (rows[moveToIndex] && isClonedKey(rows[moveToIndex].state.key!)) {
      moveToIndex = moveToIndex + 1;
    }

    rows.splice(moveToIndex + 1, 0, row);
    rows.splice(originalIndex, 1);

    this.setState({ rows });
    this.publishEvent(new ObjectsReorderedOnCanvasEvent(this), true);
  }

  public isFirstRow(row: RowItem): boolean {
    return this.state.rows[0] === row;
  }

  public isLastRow(row: RowItem): boolean {
    const filteredRow = this.state.rows.filter((r) => !isClonedKey(r.state.key!));
    return filteredRow[filteredRow.length - 1] === row;
  }

  public static createEmpty(): RowsLayoutManager {
    return new RowsLayoutManager({ rows: [new RowItem()] });
  }

  public static createFromLayout(layout: DashboardLayoutManager): RowsLayoutManager {
    let rows: RowItem[] = [];

    if (layout instanceof TabsLayoutManager) {
      for (const tab of layout.state.tabs) {
        rows.push(new RowItem({ layout: tab.state.layout.clone(), title: tab.state.title }));
      }
    } else if (layout instanceof DefaultGridLayoutManager) {
      const config: Array<{
        title?: string;
        isCollapsed?: boolean;
        isDraggable?: boolean;
        isResizable?: boolean;
        children: SceneGridItemLike[];
        repeat?: string;
      }> = [];
      let children: SceneGridItemLike[] | undefined;

      layout.state.grid.forEachChild((child) => {
        if (!(child instanceof DashboardGridItem) && !(child instanceof SceneGridRow)) {
          throw new Error('Child is not a DashboardGridItem or SceneGridRow, invalid scene');
        }

        if (child instanceof SceneGridRow) {
          if (!isClonedKey(child.state.key!)) {
            const behaviour = child.state.$behaviors?.find((b) => b instanceof RowRepeaterBehavior);

            config.push({
              title: child.state.title,
              isCollapsed: !!child.state.isCollapsed,
              isDraggable: child.state.isDraggable ?? layout.state.grid.state.isDraggable,
              isResizable: child.state.isResizable ?? layout.state.grid.state.isResizable,
              children: child.state.children,
              repeat: behaviour?.state.variableName,
            });

            // Since we encountered a row item, any subsequent panels should be added to a new row
            children = undefined;
          }
        } else {
          if (!children) {
            children = [];
            config.push({ children });
          }

          children.push(child);
        }
      });

      rows = config.map(
        (rowConfig) =>
          new RowItem({
            title: rowConfig.title,
            collapse: !!rowConfig.isCollapsed,
            layout: DefaultGridLayoutManager.fromGridItems(
              rowConfig.children,
              rowConfig.isDraggable,
              rowConfig.isResizable
            ),
            $behaviors: rowConfig.repeat ? [new RowItemRepeaterBehavior({ variableName: rowConfig.repeat })] : [],
          })
      );
    } else {
      rows = [new RowItem({ layout: layout.clone() })];
    }

    // Ensure we always get at least one row
    if (rows.length === 0) {
      rows = [new RowItem()];
    }

    return new RowsLayoutManager({ rows });
  }
}
