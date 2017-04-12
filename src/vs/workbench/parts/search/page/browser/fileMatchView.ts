import { Builder } from 'vs/base/browser/builder';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { renderMarkedString } from 'vs/base/browser/htmlContentRenderer';
import { IFileMatch, ILineMatch } from 'vs/platform/search/common/search';

export class FileMatchView implements IDisposable {

	private disposables: IDisposable[] = [];
	private content: HTMLDivElement;

	constructor(
		private builder: Builder,
		private fileMatch: IFileMatch,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IConfigurationService private configurationService: IConfigurationService,

	) {
		this.render();
	}

	render(): void {
		// Limit 3
		// Take first 3 with one line of context around
		this.builder.div({}, fileDiv => {
			this.content = <HTMLDivElement>fileDiv.getHTMLElement();
			this.fileMatch.lineMatches.forEach(lineMatch => {
				fileDiv.div({}, lineDiv => {
					this.renderLineMatch(lineDiv, lineMatch);
				});
			});
		});
	}

	renderLineMatch(builder: Builder, match: ILineMatch): void {
		builder.div({}, div => {
			// const md = this.generateMarkdown(match);
			const html = renderMarkedString({ language: 'go', value: match.preview }, {
				// renderer: this.markdownRenderer,
				codeBlockRenderer: (lang, value): string => {
					return `<div class="code">${tokenizeToString(value, lang)}</div>`;
				}

			});
			div.getHTMLElement().appendChild(html);
		});
	}

	dispose(): void {
		dispose(this.disposables);
	}

}
