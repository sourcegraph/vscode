/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


export function used() {
}

export default () => `
<div class="homePageContainer">
	<div class="homePage">
		<div class="logo"></div>
		<div class="search">
			<div class="inputSection">
				<input class="searchInput" type="text" placeholder="Search..." />
				<a class="searchButton">Search code</a>
			</div>
			<div class="filterSection">
				<div>Repositories</div>
				<textarea class="reposInput">active</textarea>
				<div class="addReposButton">
					<span>Select repositories...</span>
				</div>
			</div>
			<div class="filterSection">
				<div>Files to include</div>
				<input class="filesInput includePatternInput" placeholder="example: *.go" />
			</div>
			<div class="optionsSection">
				<label class="searchOption">
					<input class="caseSensitiveOption" type="checkbox" />
					Match case
				</label>
				<label class="searchOption">
					<input class="wholeWordsOption" type="checkbox" />
					Match whole word
				</label>
				<label class="searchOption">
					<input class="regexOption" type="checkbox" />
					Regex
				</label>
			</div>
		</div>
	</div>
</div>
`;
