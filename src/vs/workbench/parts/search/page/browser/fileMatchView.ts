import { $, Builder } from 'vs/base/browser/builder';
import { FileMatch, Match } from 'vs/workbench/parts/search/common/searchModel';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { IEditor, IEditorOptions, ICommonCodeEditor, IEditorViewState, IEditorOptions as ICodeEditorOptions, IModel } from 'vs/editor/common/editorCommon';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { isObject } from 'vs/base/common/types';
import { DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';

export class FileMatchView implements IDisposable {

	private disposables: IDisposable[] = [];
	private content: HTMLDivElement;
	private scrollbar: DomScrollableElement;

	constructor(
		private builder: Builder,
		private fileMatch: FileMatch,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IConfigurationService private configurationService: IConfigurationService,

	) {
		this.render();
	}

	render(): void {
		this.builder.div({}, fileDiv => {
			this.content = <HTMLDivElement>fileDiv.getHTMLElement();
			this.fileMatch.matches().forEach(lineMatch => {
				fileDiv.div({}, lineDiv => {
					this.renderLineMatch(lineDiv, lineMatch);
				});
			});
		});
		this.scrollbar = new DomScrollableElement(this.content, {
			canUseTranslate3d: false,
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Auto
		});
		this.disposables.push(this.scrollbar);
		// this.builder.getHTMLElement().appendChild(this.scrollbar.getDomNode());
	}

	renderLineMatch(builder: Builder, match: Match): void {
		builder.div({}, div => {
			div.innerHtml(match.text());
		});
	}

	private renderSnippet(model: IModel, div: HTMLDivElement): void {
		const options = this.getEditorOptions(model.getModeId());
		const editor = this.instantiationService.createInstance(CodeEditor, div, options);
		editor.setModel(model);
		this.disposables.push(editor);

		const updateHeight = (initial: boolean) => {
			const lineHeight = editor.getConfiguration().lineHeight;
			const height = `${Math.max(model.getLineCount() + 1, 4) * lineHeight}px`;
			if (div.style.height !== height) {
				div.style.height = height;
				editor.layout();
				if (!initial) {
					this.scrollbar.scanDomNode();
				}
			}
		};
		updateHeight(true);
		this.disposables.push(editor.onDidChangeModelContent(() => updateHeight(false)));
		this.disposables.push(editor.onDidChangeCursorPosition(e => {
			const innerContent = this.content.firstElementChild;
			if (innerContent) {
				const targetTop = div.getBoundingClientRect().top;
				const containerTop = innerContent.getBoundingClientRect().top;
				const lineHeight = editor.getConfiguration().lineHeight;
				const lineTop = (targetTop + (e.position.lineNumber - 1) * lineHeight) - containerTop;
				const lineBottom = lineTop + lineHeight;
				const scrollState = this.scrollbar.getScrollState();
				const scrollTop = scrollState.scrollTop;
				const height = scrollState.height;
				if (scrollTop > lineTop) {
					this.scrollbar.updateState({ scrollTop: lineTop });
				} else if (scrollTop < lineBottom - height) {
					this.scrollbar.updateState({ scrollTop: lineBottom - height });
				}
			}
		}));

		this.disposables.push(this.themeService.onDidColorThemeChange(theme => editor.updateOptions({ theme: theme.id })));
		this.disposables.push(this.configurationService.onDidUpdateConfiguration(() => editor.updateOptions(this.getEditorOptions(model.getModeId()))));
	}

	dispose(): void {
		dispose(this.disposables);
	}


	private getEditorOptions(language: string): IEditorOptions {
		const config = this.configurationService.getConfiguration<IEditorOptions>({ overrideIdentifier: language, section: 'editor' });
		return {
			...isObject(config) ? config : Object.create(null),
			scrollBeyondLastLine: false,
			scrollbar: DefaultConfig.editor.scrollbar,
			overviewRulerLanes: 3,
			fixedOverflowWidgets: true,
			lineNumbersMinChars: 1,
			theme: this.themeService.getColorTheme().id,
			minimap: false,
		};
	}

}
