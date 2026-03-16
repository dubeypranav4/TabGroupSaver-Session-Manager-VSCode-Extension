import * as vscode from "vscode";
import * as path from "path";
import { TabGroup } from "../models/tabGroup";
import { TabGroupService } from "../services/tabGroupService";

/**
 * Tree item representing a tab group
 */
export class TabGroupTreeItem extends vscode.TreeItem {
    constructor(
        public readonly tabGroup: TabGroup,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(tabGroup.groupName, collapsibleState);

        const fileCount = getTabGroupFiles(tabGroup).length;
        this.tooltip = `${fileCount} files`;
        this.description = `${fileCount} files`;

        // Set icon based on whether this is the default group
        this.iconPath = tabGroup.isDefault
            ? new vscode.ThemeIcon("star-full")
            : new vscode.ThemeIcon("files");

        // Set context value for when clause in package.json
        this.contextValue = "tabGroup";
    }
}

/**
 * Tree item representing a file in a tab group
 */
export class FileTreeItem extends vscode.TreeItem {
    constructor(public readonly filePath: string) {
        super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);

        this.tooltip = filePath;
        this.description = path.dirname(filePath);

        // Set file icon
        this.resourceUri = vscode.Uri.file(filePath);

        // Make the file clickable to open it
        this.command = {
            command: "vscode.open",
            title: "Open File",
            arguments: [vscode.Uri.file(filePath)],
        };

        // Set context value for when clause in package.json
        this.contextValue = "file";
    }
}

/**
 * TreeDataProvider for tab groups
 */
export class TabGroupTreeDataProvider
    implements vscode.TreeDataProvider<vscode.TreeItem>
{
    private _onDidChangeTreeData: vscode.EventEmitter<
        vscode.TreeItem | undefined | null | void
    > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        vscode.TreeItem | undefined | null | void
    > = this._onDidChangeTreeData.event;

    constructor(private tabGroupService: TabGroupService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            // Root level - show all tab groups
            const tabGroups = await this.tabGroupService.getTabGroups();

            // Sort by last used (most recent first)
            tabGroups.sort(
                (a, b) =>
                    new Date(b.lastUsed).getTime() -
                    new Date(a.lastUsed).getTime()
            );

            return tabGroups.map(
                (tabGroup) =>
                    new TabGroupTreeItem(
                        tabGroup,
                        vscode.TreeItemCollapsibleState.Collapsed
                    )
            );
        } else if (element instanceof TabGroupTreeItem) {
            // Tab group level - show files
            return getTabGroupFiles(element.tabGroup).map(
                (filePath) => new FileTreeItem(filePath)
            );
        }

        return [];
    }
}

/**
 * Register the tab group tree view
 */
export function registerTabGroupTreeView(
    context: vscode.ExtensionContext,
    tabGroupService: TabGroupService
): vscode.TreeView<vscode.TreeItem> {
    const treeDataProvider = new TabGroupTreeDataProvider(tabGroupService);

    const treeView = vscode.window.createTreeView("tabGroupsExplorer", {
        treeDataProvider,
        showCollapseAll: true,
    });

    context.subscriptions.push(treeView);

    // Register auto-save on window close
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(async () => {
            try {
                await tabGroupService.autoSaveCurrentTabs();
            } catch (error) {
                console.error("Error auto-saving tabs:", error);
            }
        })
    );

    return treeView;
}

function getTabGroupFiles(tabGroup: TabGroup): string[] {
    if (tabGroup.files && tabGroup.files.length > 0) {
        return tabGroup.files;
    }

    const groupedFiles = tabGroup.groups?.flatMap(group =>
        group.tabs
            .map(tab => {
                try {
                    return vscode.Uri.parse(tab).fsPath;
                } catch {
                    return undefined;
                }
            })
            .filter((filePath): filePath is string => Boolean(filePath))
    );

    return groupedFiles ?? [];
}
