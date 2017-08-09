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
				<a class="searchButton">Search Code</a>
			</div>
			<div class="filterSection">
				<div>Repositories</div>
				<textarea placeholder="All Repositories in Current Workspace" class="reposInput"></textarea>
				<div class="addReposButton">
					<span>Select repositories...</span>
				</div>
			</div>
			<div class="filterSection">
				<div>Files to Include</div>
				<input class="filesInput includePatternInput" placeholder="Example: *.go" />
			</div>
			<div class="optionsSection">
				<label class="searchOption">
					<input class="caseSensitiveOption" type="checkbox" />
					Match Case
				</label>
				<label class="searchOption">
					<input class="wholeWordsOption" type="checkbox" />
					Match Whole Word
				</label>
				<label class="searchOption">
					<input class="regexOption" type="checkbox" />
					Regular Expression
				</label>
			</div>
		</div>
	</div>
</div>
`;
