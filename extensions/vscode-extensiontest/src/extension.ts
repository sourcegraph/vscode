import { ExtensionContext, ReferenceProvider, ReferenceContext, TextDocument, CancellationToken, ProgressProviderResult, Location, Position, Uri, languages } from 'vscode';

export function activate(context: ExtensionContext) {
	const goReferenceProvider = new GoReferenceProvider();
	languages.registerReferenceProvider("go", goReferenceProvider);
	context.subscriptions.push(goReferenceProvider);
}

export class GoReferenceProvider implements ReferenceProvider {

	provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): ProgressProviderResult<Location[], Location> {
		console.log("provide references2");
		const referenceProvider = new MockReferenceProvider();
		referenceProvider.start();
		// const p = new Promise<Number>((resolve, reject) => {
		// 	resolve(5);
		// }).then(val => {
		// 	return "" + val;
		// });
		// return new MockReferenceProvider();
		return referenceProvider;
	}

	dispose(): void {
		console.log("disposed");
	}
}

export type FulfillHandler<T, R> = (value: T) => R | Thenable<R>;
export type RejectHandler<R> = (reason: any) => R | Thenable<R> | void;
export type ProgressHandler<P> = (value: P) => void;

export class Subscriber<T, P, R> {
	constructor(
		public next: ProgressThenableImpl<R, P>,
		public fulfillHandler?: FulfillHandler<T, R>,
		public rejectHandler?: RejectHandler<R>,
		public progressHandler?: ProgressHandler<P>
	) {

	}
}

export class ProgressThenableImpl<T, P> implements ProgressThenable<T, P> {

	private fulfilledValue?: T;
	private rejectedReason?: any;

	private done: boolean;

	private subscribers: Array<Subscriber<T, P, any>>;

	constructor() {
		this.subscribers = [];
	}

	// constructor(private init: (fulfill?: (value: T) => void, reject?: (reason: any) => void, progress?: (value: P) => void) => void) {
	// 	this.subscribers = [];
	// 	init(
	// 		(value: T) => {

	// 		},
	// 		(reason: any) => {

	// 		},
	// 		(value: P) => void {

	// 		}
	// 	)
	// }

	/**
	 * 2.3 Promise Resolution Procedure
	 * https://promisesaplus.com/#point-45
	 */
	private resolve<R, P>(promise: ProgressThenableImpl<R, P>, x: R | Thenable<R>) {
		if (promise === x) {
			promise.reject(new TypeError("failed to resolve promise [2.3.1]: https://promisesaplus.com/#point-48"));
			return;
		}

		if (this.isThenable(x)) {
			var done = false;
			const resolvePromise = (y) => {
				if (!done) {
					done = true;
					this.resolve(promise, y);
				}
			};
			const rejectPromise = (r) => {
				if (!done) {
					done = true;
					promise.reject(r);
				}
			};
			try {
				x.then(resolvePromise, rejectPromise);
			} catch (e) {
				if (!done) {
					done = true;
					promise.reject(e);
				}
			}
		} else {
			promise.fulfill(x);
		}
	}

	private isThenable<T>(obj: any): obj is Thenable<T> {
		return obj && typeof (<Thenable<any>>obj).then === 'function';
	}

	then<R>(onfulfilled?: FulfillHandler<T, R>, onrejected?: RejectHandler<R>, onprogress?: ProgressHandler<P>): ProgressThenable<R, P> {
		const next = new ProgressThenableImpl<R, P>();
		const subscriber = new Subscriber<T, P, R>(next, onfulfilled, onrejected, onprogress);
		if (this.fulfilledValue) {
			this.notifyFulfilled(subscriber);
		} else if (this.rejectedReason) {
			this.notifyRejected(subscriber);
		} else {
			this.subscribers.push(subscriber);
		}
		return next;
	}

	private notifyFulfilled(subscriber: Subscriber<T, P, any>): void {
		if (subscriber.fulfillHandler) {
			try {
				const result = subscriber.fulfillHandler.call(undefined, this.fulfilledValue);
				if (result) {
					this.resolve(subscriber.next, result);
				}
			} catch (e) {
				subscriber.next.reject(e);
			}
		}
	}

	private notifyRejected(subscriber: Subscriber<T, P, any>): void {
		if (subscriber.rejectHandler) {
			try {
				const result = subscriber.rejectHandler.call(undefined, this.rejectedReason);
				if (result) {
					this.resolve(subscriber.next, result);
				}
			} catch (e) {
				subscriber.next.reject(e);
			}
		}
	}

	private notifyProgress(subscriber: Subscriber<T, P, any>, value: P): void {
		if (subscriber.progressHandler) {
			subscriber.progressHandler.call(undefined, value);
		}
	}

	progress(value: P): void {
		if (!this.done) {
			this.subscribers.forEach(subscriber => {
				this.notifyProgress(subscriber, value);
			});
		}
	}

	fulfill(value: T): void {
		if (!this.done) {
			this.done = true;
			this.fulfilledValue = value;
			this.subscribers.forEach(subscriber => {
				this.notifyFulfilled(subscriber);
			});
		}
	}

	reject(reason: any): void {
		if (!this.done) {
			this.done = true;
			this.rejectedReason = reason;
			this.subscribers.forEach(subscriber => {
				this.notifyRejected(subscriber);
			});
		}
	}
}

export class MockReferenceProvider extends ProgressThenableImpl<Location[], Location> {

	start(): MockReferenceProvider {
		const locations: Array<Location> = [
			new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/app.go"), new Position(1, 2)),
			new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/doc.go"), new Position(2, 3)),
			new Location(Uri.parse("file:///Users/nick/code/gopath/src/sourcegraph.com/sourcegraph/sourcegraph/app/init.go"), new Position(3, 4)),
		];

		setTimeout(() => {
			this.progress(locations[0]);
		}, 1000);

		setTimeout(() => {
			this.progress(locations[1]);
		}, 2000);

		setTimeout(() => {
			this.fulfill(locations);
		}, 3000);

		return this;
	}

}
