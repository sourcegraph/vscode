/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

const PARAGRAPHS = [
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris nec sapien bibendum, cursus diam sed, pellentesque risus. Phasellus varius, urna et congue efficitur, arcu velit accumsan nisi, nec accumsan justo erat eu felis. Vivamus ex est, bibendum vel dictum ut, tincidunt ac risus. Suspendisse non urna eget purus sagittis tempus et id turpis. Nam laoreet, ante vitae iaculis fermentum, quam nisl scelerisque sapien, sit amet vulputate nisl nunc quis quam. Aenean sed tristique purus, sed sagittis libero. Nam finibus orci ipsum, sit amet lobortis dolor molestie eu. Ut vitae lectus eget libero gravida pretium. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Praesent placerat ligula magna, ut placerat ligula facilisis eget.',
	'Nam cursus erat sed augue efficitur placerat.Cras eu metus condimentum, mattis diam vitae, maximus lacus.Vivamus vestibulum ligula sed odio pulvinar maximus.Vivamus et ex molestie sapien aliquet viverra.Fusce maximus accumsan nibh, porttitor commodo orci imperdiet at.Duis vel augue id odio pellentesque laoreet.Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.Quisque laoreet aliquet mi id sodales.Suspendisse sed magna vulputate, mollis arcu vitae, elementum enim.Sed rhoncus ante in leo tincidunt iaculis.Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos.',
	'Duis cursus facilisis mauris.Suspendisse vitae vestibulum purus, non auctor dolor.Etiam congue, lacus non aliquet semper, est enim semper felis, in consequat tortor libero ut ipsum.Aenean varius fringilla porta.Maecenas blandit odio id tortor facilisis, ut pharetra erat eleifend.Phasellus dignissim vehicula metus at pretium.Aenean dictum pellentesque dui quis mattis.Nam tempor quam quis nisl pretium molestie.Sed sit amet metus sed justo porta venenatis.Mauris in malesuada velit.',
	'Morbi porttitor purus vitae mi porttitor pharetra. Sed id dui lectus. Donec ullamcorper turpis a arcu efficitur laoreet sit amet non enim. Vestibulum commodo hendrerit dictum. Nulla facilisi. Vestibulum fringilla ante sit amet sagittis eleifend. Duis tempor, lacus ut pulvinar volutpat, nisi dui eleifend leo, ut convallis orci lorem non justo. Vivamus quis blandit nisl. Aliquam diam justo, aliquet vitae tempor ac, tristique eget libero. Quisque non dictum nunc, eget ultrices turpis.',
	'Donec posuere dignissim pellentesque. Cras sed ante aliquam, semper purus ac, auctor tortor. Nulla nulla lacus, tristique sed augue at, placerat lacinia ante. Proin a turpis ultrices, imperdiet enim et, aliquam mi. Cras volutpat tellus non rhoncus mollis. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Nulla efficitur lobortis cursus. Aliquam dui tellus, rhoncus euismod justo nec, consequat egestas lacus. Suspendisse at purus diam. Nulla eget lobortis nisi. Suspendisse tristique, nunc eu pulvinar dictum, risus leo accumsan libero, id fringilla enim justo eu erat. Ut eget diam orci. Praesent facilisis euismod dolor, ut posuere erat malesuada pulvinar. Ut ac hendrerit velit. Aenean cursus risus nunc.',
	'Aliquam volutpat commodo sapien, eu ultricies purus blandit sit amet. Nam porta ante a tortor aliquam, tincidunt tempor sem dignissim. Quisque sit amet lacinia arcu, in maximus lorem. Fusce ut erat eget eros imperdiet efficitur ut at lectus. Ut quis imperdiet lorem. Nullam in nibh dignissim, convallis justo vitae, pulvinar massa. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Nunc finibus, orci ut pellentesque scelerisque, magna quam iaculis quam, et venenatis enim risus nec metus. Duis sit amet bibendum justo. Maecenas varius maximus urna, posuere condimentum urna. Aliquam at diam sed neque euismod dapibus. In placerat ornare justo a dapibus. Duis maximus vel felis eu eleifend. Praesent nec tristique ex. Quisque faucibus egestas dignissim.',
	'Maecenas est tortor, consequat ut vehicula ut, pellentesque a justo. Cras maximus venenatis sagittis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Suspendisse sit amet pretium enim. Vivamus velit leo, sollicitudin et mattis rhoncus, commodo vel elit. Aliquam semper ultrices orci sit amet ullamcorper. Etiam et nibh vitae eros pellentesque posuere quis sed erat.',
	'Nullam erat est, blandit in auctor vitae, pulvinar id leo. Interdum et malesuada fames ac ante ipsum primis in faucibus. Donec sagittis quis quam ut auctor. Vivamus molestie vitae orci ac finibus. Nunc gravida ac dui cursus tempor. Integer eleifend velit nulla, vel viverra turpis tincidunt et. Morbi lobortis nulla a tempus placerat. Morbi venenatis libero nec vestibulum faucibus. Vestibulum sagittis aliquet enim quis porta. Maecenas commodo pellentesque augue, ut tristique elit porttitor volutpat. Integer pharetra erat erat, vestibulum convallis risus posuere in. Curabitur lacus lectus, condimentum quis rutrum vel, efficitur vitae augue.',
];

type Operation = { action: 'get' } | { action: 'set', value: string };

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('sampleViewZone.loremIpsum.create', (editor?: vscode.TextEditor, range?: vscode.Range) => {
			if (!editor || !(editor as any).document) {
				editor = vscode.window.activeTextEditor;
				range = undefined;
			}
			if (!editor) {
				return vscode.window.showErrorMessage('No active editor.');
			}
			if (!range) {
				range = editor.selection;
			}

			const viewZone = editor.createViewZone('loremIpsum', {
				type: 'html',
				value: `
					<!DOCTYPE html>
					<html>
						<head><meta charset="utf-8" /></head>
						<body>
							<script src="${path.join(__dirname, '..', 'view', 'loremIpsum.js')}" > </script>
						</body>
					</html>`,
			});
			context.subscriptions.push(viewZone);

			viewZone.header = { primaryHeading: 'Lorem Ipsum' };
			viewZone.postMessage(JSON.stringify({ action: 'set', value: PARAGRAPHS[0] } as Operation));
			viewZone.show(range);
		}),
		vscode.commands.registerCommand('sampleViewZone.loremIpsum.addParagraph', viewZone => addParagraph(viewZone)),
		vscode.commands.registerCommand('sampleViewZone.loremIpsum.removeParagraph', viewZone => removeParagraph(viewZone)),
	);
}

function addParagraph(viewZone: vscode.TextEditorViewZone): Thenable<void> {
	return editText(viewZone, text => {
		const randomParagraph = PARAGRAPHS[Math.floor(Math.random() * PARAGRAPHS.length)];
		return text + '\n\n' + randomParagraph;
	});
}

function removeParagraph(viewZone: vscode.TextEditorViewZone): Thenable<void> {
	return editText(viewZone, text => {
		if (!text) {
			vscode.window.showInformationMessage('Unable to remove paragraph because Lorem Ipsum view zone is already empty.');
			return '';
		}

		const paragraphs = text.split('\n\n');
		return paragraphs.slice(0, -1).join('\n\n');
	});
}

function editText(viewZone: vscode.TextEditorViewZone, edit: (originalText: string) => string): Thenable<void> {
	return new Promise(resolve => {
		const disposable = viewZone.onMessage(text => {
			disposable.dispose();
			viewZone.postMessage(JSON.stringify({ action: 'set', value: edit(text) } as Operation));
			resolve();
		});
		viewZone.postMessage(JSON.stringify({ action: 'get' } as Operation));
	});
}
