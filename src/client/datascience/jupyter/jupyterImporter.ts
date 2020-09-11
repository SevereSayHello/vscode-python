// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import '../../common/extensions';

import { inject, injectable } from 'inversify';
import * as path from 'path';

import { Uri } from 'vscode';
import { IWorkspaceService } from '../../common/application/types';
import { traceError } from '../../common/logger';
import { IPlatformService } from '../../common/platform/types';
import { IConfigurationService, IDisposableRegistry } from '../../common/types';
import * as localize from '../../common/utils/localize';
import { noop } from '../../common/utils/misc';
import { CodeSnippets, Identifiers } from '../constants';
import { IDataScienceFileSystem, INotebookImporter } from '../types';

@injectable()
export class JupyterImporter implements INotebookImporter {
    public isDisposed: boolean = false;
    // Template that changes markdown cells to have # %% [markdown] in the comments
    private readonly nbconvertTemplateFormat =
        // tslint:disable-next-line:no-multiline-string
        `{%- extends 'null.tpl' -%}
{% block codecell %}
{0}
{{ super() }}
{% endblock codecell %}
{% block in_prompt %}{% endblock in_prompt %}
{% block input %}{{ cell.source | ipython2python }}{% endblock input %}
{% block markdowncell scoped %}{0} [markdown]
{{ cell.source | comment_lines }}
{% endblock markdowncell %}`;

    constructor(
        @inject(IDataScienceFileSystem) private fs: IDataScienceFileSystem,
        @inject(IDisposableRegistry) private disposableRegistry: IDisposableRegistry,
        @inject(IConfigurationService) private configuration: IConfigurationService,
        @inject(IWorkspaceService) private workspaceService: IWorkspaceService,
        @inject(IPlatformService) private readonly platform: IPlatformService
    ) {}

    public async importFromFile(_sourceFile: Uri): Promise<string> {
        // If the user has requested it, add a cd command to the imported file so that relative paths still work
        // const settings = this.configuration.getSettings();
        // let directoryChange: string | undefined;
        // if (settings.datascience.changeDirOnImportExport) {
        //     directoryChange = await this.calculateDirectoryChange(sourceFile);
        // }
        // tslint:disable-next-line: no-console
        console.log(this.calculateDirectoryChange.toString() ? '' : '');
        // tslint:disable-next-line: no-console
        console.log(this.createTemplateFile.toString() ? '' : '');
        throw new Error(localize.DataScience.jupyterNbConvertNotSupported());
    }

    public dispose = () => {
        this.isDisposed = true;
    };

    private get defaultCellMarker(): string {
        return this.configuration.getSettings().datascience.defaultCellMarker || Identifiers.DefaultCodeCellMarker;
    }

    // When importing a file, calculate if we can create a %cd so that the relative paths work
    private async calculateDirectoryChange(notebookFile: Uri): Promise<string | undefined> {
        let directoryChange: string | undefined;
        try {
            // Make sure we don't already have an import/export comment in the file
            const contents = await this.fs.readFile(notebookFile);
            const haveChangeAlready = contents.includes(CodeSnippets.ChangeDirectoryCommentIdentifier);

            if (!haveChangeAlready) {
                const notebookFilePath = path.dirname(notebookFile.fsPath);
                // First see if we have a workspace open, this only works if we have a workspace root to be relative to
                if (this.workspaceService.hasWorkspaceFolders) {
                    const workspacePath = this.workspaceService.workspaceFolders![0].uri.fsPath;

                    // Make sure that we have everything that we need here
                    if (
                        workspacePath &&
                        path.isAbsolute(workspacePath) &&
                        notebookFilePath &&
                        path.isAbsolute(notebookFilePath)
                    ) {
                        directoryChange = path.relative(workspacePath, notebookFilePath);
                    }
                }
            }

            // If path.relative can't calculate a relative path, then it just returns the full second path
            // so check here, we only want this if we were able to calculate a relative path, no network shares or drives
            if (directoryChange && !path.isAbsolute(directoryChange)) {
                // Escape windows path chars so they end up in the source escaped
                if (this.platform.isWindows) {
                    directoryChange = directoryChange.replace('\\', '\\\\');
                }

                return directoryChange;
            } else {
                return undefined;
            }
        } catch (e) {
            traceError(e);
        }
    }

    private async createTemplateFile(): Promise<string | undefined> {
        // Create a temp file on disk
        const file = await this.fs.createTemporaryLocalFile('.tpl');

        // Write our template into it
        if (file) {
            try {
                // Save this file into our disposables so the temp file goes away
                this.disposableRegistry.push(file);
                await this.fs.appendLocalFile(
                    file.filePath,
                    this.nbconvertTemplateFormat.format(this.defaultCellMarker)
                );

                // Now we should have a template that will convert
                return file.filePath;
            } catch {
                noop();
            }
        }
    }
}
