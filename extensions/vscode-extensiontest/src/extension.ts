import { ExtensionContext, ReferenceProvider, ReferenceContext, TextDocument, CancellationToken, ProgressProviderResult, Location, Position, languages } from 'vscode';

export function activate(context: ExtensionContext) {
	const goReferenceProvider = new GoReferenceProvider();
	languages.registerReferenceProvider("go", goReferenceProvider);
	context.subscriptions.push(goReferenceProvider);
}

export class GoReferenceProvider implements ReferenceProvider {
	provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): ProgressProviderResult<Location[], Location> {
		console.log("provide references");
		return null;
	}

	dispose(): void {
		console.log("disposed");
	}
}
