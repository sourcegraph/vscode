import { ExtensionContext, ReferenceProvider, ReferenceContext, TextDocument, CancellationToken, ProviderResult, Location, Position, Uri, languages } from 'vscode';

export function activate(context: ExtensionContext) {
	const goReferenceProvider = new GoReferenceProvider();
	languages.registerReferenceProvider("go", goReferenceProvider);
	context.subscriptions.push(goReferenceProvider);
}

/**
 * This is just a proof of concept extension. It should not be merged.
 */
export class GoReferenceProvider implements ReferenceProvider {

	provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken, progress: (locations: Location[]) => void): ProviderResult<Location[]> {
		console.log("provide references");
		return new Promise<Location[]>((resolve, reject) => {

			const locations: Array<Location> = [
				new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/app.go"), new Position(1, 2)),
				new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/doc.go"), new Position(2, 3)),
				new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/init.go"), new Position(3, 4)),
				new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/app.go"), new Position(5, 6)),
				new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/doc.go"), new Position(7, 8)),
				new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/init.go"), new Position(9, 10)),
				new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/app.go"), new Position(11, 12)),
				new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/doc.go"), new Position(13, 14)),
				new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/init.go"), new Position(15, 16)),
			];

			const delay = 2000;
			locations.reverse().reduce<Promise<void>>((promise, location, index) => {
				return promise.then(() => {
					return new Promise<void>((resolve, reject) => {
						setTimeout(() => {
							if (!token.isCancellationRequested) {
								console.log("sending progress " + index);
								progress([location]);
							}
							resolve();
						}, delay);
					});
				});
			}, Promise.resolve()).then(() => {
				setTimeout(() => {
					resolve(locations);
				}, delay);
			});
		});
	}

	dispose(): void {
		console.log("disposed");
	}
}
