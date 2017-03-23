import { $, Builder } from 'vs/base/browser/builder';
import { FileMatch, Match } from 'vs/workbench/parts/search/common/searchModel';

export class FileMatchView {

	constructor(
		private builder: Builder,
		private fileMatch: FileMatch,
	) {
		this.render();
	}

	render(): void {
		this.builder.div({}, fileDiv => {
			this.fileMatch.matches().forEach(lineMatch => {
				fileDiv.div({}, lineDiv => {
					this.renderLineMatch(lineDiv, lineMatch);
				});
			});
		});
	}

	renderLineMatch(builder: Builder, match: Match): void {
		builder.div({}, div => {
			console.log(match.text());
			div.innerHtml(match.text());
		});
	}

}
