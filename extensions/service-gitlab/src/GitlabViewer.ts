import * as vscode from 'vscode';

// Gets Gitlab information associated for the current user. Uses a cache to prevent multiple
// requests. Based on the github viewer.
export class GitlabViewer {
    private token: string;
    private host: string;
	private repoRequest: Thenable<vscode.CatalogFolder[]> | null;
	private usernameRequest: Thenable<string | null> | null;

	// Returns the username of the currently logged in user. It is best-effort, so if the
	// network request fails or there is no logged in user null is returned.
	public username(): Thenable<string | null> {
		if (!this.validState()) {
			return Promise.resolve(null);
        }
        
		if (this.usernameRequest !== null) {
			return this.usernameRequest;
        }
        
        const request = this.doGitlabRequest(this.host, this.token, '/user')
            
        .then<string | null>((data: any) => {
				return data.viewer.login;
			}, (reason) => {
				// try again, but don't fail other requests if this fails
				console.error(reason);
				this.usernameRequest = null;
				return null;
            });
            
		this.usernameRequest = request;
		return request;
	}

	// Returns true if you can do a request or use a cached request.
	private validState(): boolean {
        const token = vscode.workspace.getConfiguration('gitlab').get<string>('token');
        const host = vscode.workspace.getConfiguration('gitlab').get<string>('host');
		if (!token) {
			return false;
        }

        if(!host) {
            return false;
        }

		if (token !== this.token) {
			this.repoRequest = null;
			this.usernameRequest = null;
		}
        
        if(host !== this.host) {
            this.repoRequest = null;
            this.usernameRequest = null;
        }

        this.token = token;
        this.host = host;

		return true;
    }
    
    private doGitlabRequest<T>(host: string, token: string, endpoint: string): Thenable<T> {
        return fetch(`${host}/api/v4${endpoint}?private_toke=${token}`,{
            method: 'GET'
        })
        .then(response => {
            if( response.status < 200 || response.status > 299) {
                return response.json().then(
                    // TODO: Put in error message
                    (error: { message: string} ) => {}
                );
            }

            return response.json();
        });
    }
}