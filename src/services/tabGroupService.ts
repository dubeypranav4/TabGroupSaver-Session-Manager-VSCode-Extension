import * as vscode from 'vscode';
import { SavedEditorGroup, TabGroup } from '../models/tabGroup';
import { StorageService } from './storageService';

/**
 * Service for managing tab groups
 */
export class TabGroupService {
    private storageService: StorageService;

    constructor(context: vscode.ExtensionContext) {
        this.storageService = new StorageService(context);
    }

    /**
     * Get all saved tab groups
     */
    public async getTabGroups(): Promise<TabGroup[]> {
        return this.storageService.getTabGroups();
    }

    /**
     * Save current tabs as a new group
     */
    public async saveCurrentTabs(groupName: string): Promise<TabGroup> {
        const tabGroups = await this.getTabGroups();

        // Check if group name already exists
        const existingGroupIndex = tabGroups.findIndex(group => group.groupName === groupName);

        // Get current open tabs with editor layout
        const openEditorGroups = this.getOpenEditorGroups();

        // Create new tab group
        const newTabGroup: TabGroup = {
            groupName,
            files: openEditorGroups.flatMap(group => group.tabs),
            groups: openEditorGroups,
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };

        // Update or add the tab group
        if (existingGroupIndex !== -1) {
            tabGroups[existingGroupIndex] = newTabGroup;
        } else {
            tabGroups.push(newTabGroup);
        }

        // Save updated tab groups
        await this.storageService.saveTabGroups(tabGroups);

        return newTabGroup;
    }

    /**
     * Load a tab group
     */
    public async loadTabGroup(groupName: string): Promise<void> {
        const tabGroups = await this.getTabGroups();
        const tabGroup = tabGroups.find(group => group.groupName === groupName);

        if (!tabGroup) {
            throw new Error(`Tab group '${groupName}' not found`);
        }

        // Update last used timestamp
        tabGroup.lastUsed = new Date().toISOString();
        await this.storageService.saveTabGroups(tabGroups);

        // Open files with grouped layout (or fallback to legacy flat layout)
        const savedGroups = this.getRestorableGroups(tabGroup);
        for (const savedGroup of savedGroups) {
            for (const tabUri of savedGroup.tabs) {
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(tabUri));
                    await vscode.window.showTextDocument(document, {
                        preview: false,
                        viewColumn: this.resolveViewColumn(savedGroup.viewColumn)
                    });
                } catch (error) {
                    console.error(`Error opening file: ${tabUri}`, error);
                    // Continue opening other files even if one fails
                }
            }
        }
    }

    /**
     * Delete a tab group
     */
    public async deleteTabGroup(groupName: string): Promise<void> {
        const tabGroups = await this.getTabGroups();
        const updatedTabGroups = tabGroups.filter(group => group.groupName !== groupName);

        if (tabGroups.length === updatedTabGroups.length) {
            throw new Error(`Tab group '${groupName}' not found`);
        }

        await this.storageService.saveTabGroups(updatedTabGroups);
    }

    /**
     * Rename a tab group
     */
    public async renameTabGroup(oldName: string, newName: string): Promise<void> {
        const tabGroups = await this.getTabGroups();
        const tabGroup = tabGroups.find(group => group.groupName === oldName);

        if (!tabGroup) {
            throw new Error(`Tab group '${oldName}' not found`);
        }

        // Check if new name already exists
        if (tabGroups.some(group => group.groupName === newName)) {
            throw new Error(`Tab group '${newName}' already exists`);
        }

        tabGroup.groupName = newName;
        await this.storageService.saveTabGroups(tabGroups);
    }

    /**
     * Set a tab group as the default
     */
    public async setDefaultTabGroup(groupName: string): Promise<void> {
        const tabGroups = await this.getTabGroups();

        // Remove default flag from all groups
        tabGroups.forEach(group => {
            group.isDefault = false;
        });

        // Set default flag for the specified group
        const tabGroup = tabGroups.find(group => group.groupName === groupName);
        if (!tabGroup) {
            throw new Error(`Tab group '${groupName}' not found`);
        }

        tabGroup.isDefault = true;
        await this.storageService.saveTabGroups(tabGroups);
    }

    /**
     * Get the default tab group
     */
    public async getDefaultTabGroup(): Promise<TabGroup | undefined> {
        const tabGroups = await this.getTabGroups();
        return tabGroups.find(group => group.isDefault);
    }

    /**
     * Auto-save current tabs
     */
    public async autoSaveCurrentTabs(): Promise<void> {
        const settings = this.storageService.getSettings();

        if (settings.autoSaveOnClose) {
            await this.saveCurrentTabs('Auto-saved Tabs');
        }
    }

    /**
     * Auto-restore default tab group
     */
    public async autoRestoreDefaultTabGroup(): Promise<void> {
        const settings = this.storageService.getSettings();

        if (settings.autoRestoreDefault) {
            const defaultGroup = await this.getDefaultTabGroup();

            if (defaultGroup) {
                await this.loadTabGroup(defaultGroup.groupName);
            }
        }
    }

    /**
     * Capture currently open editor groups and their file tabs
     */
    private getOpenEditorGroups(): SavedEditorGroup[] {
        return vscode.window.tabGroups.all
            .map(group => {
                const tabs = group.tabs
                    .map(tab => this.getTabUri(tab))
                    .filter((tabUri): tabUri is string => Boolean(tabUri));

                return {
                    viewColumn: group.viewColumn,
                    tabs
                };
            })
            .filter(group => group.tabs.length > 0);
    }

    /**
     * Convert a tab input into a URI string when possible
     */
    private getTabUri(tab: vscode.Tab): string | undefined {
        if (tab.input instanceof vscode.TabInputText) {
            return tab.input.uri.toString();
        }

        return undefined;
    }

    /**
     * Resolve groups from persisted schema with legacy fallback
     */
    private getRestorableGroups(tabGroup: TabGroup): SavedEditorGroup[] {
        if (tabGroup.groups && tabGroup.groups.length > 0) {
            return tabGroup.groups;
        }

        const legacyFiles = tabGroup.files ?? [];
        if (legacyFiles.length === 0) {
            return [];
        }

        return [{
            viewColumn: vscode.ViewColumn.One,
            tabs: legacyFiles.map(file => vscode.Uri.file(file).toString())
        }];
    }

    /**
     * Ensure view column is valid before passing to showTextDocument
     */
    private resolveViewColumn(viewColumn?: number): vscode.ViewColumn | undefined {
        if (typeof viewColumn === 'number' && Number.isInteger(viewColumn) && viewColumn > 0) {
            return viewColumn as vscode.ViewColumn;
        }

        return undefined;
    }
}
