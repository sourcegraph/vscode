/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { flatten } from 'vs/base/common/arrays';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IFolderSearchProvider, IFolderResult, IFolderSearchService } from 'vs/platform/folders/common/folderSearch';

export class FolderSearchService implements IFolderSearchService {

    _serviceBrand: any;

    private providers = new Map<string, IFolderSearchProvider>();

    public registerFolderSearchProvider(id: string, provider: IFolderSearchProvider): IDisposable {
        if (this.providers.has(id)) {
            throw new Error(`folder search provider already exists for id '${id}'`);
        }

        this.providers.set(id, provider);

        return toDisposable(() => {
            if (this.providers.get(id) === provider) {
                this.providers.delete(id);
            }
        });
    }

    public search(query: string): TPromise<IFolderResult[]> {
        const promises: TPromise<IFolderResult[]>[] = [];
        this.providers.forEach((provider, id) => {
            promises.push(provider.search(query));
        });
        return TPromise.join(promises).then(flatten);
    }
}
