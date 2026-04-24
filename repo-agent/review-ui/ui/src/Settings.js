import React, { useState, useEffect, useRef } from 'react';

function Settings({ onBack }) {
    const [githubPat, setGithubPat] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [claudeKey, setClaudeKey] = useState('');
    const [touched, setTouched] = useState({ github: false, gemini: false, claude: false });
    
    const [status, setStatus] = useState({ github_pat_set: false, gemini_api_key_set: false, claude_api_key_set: false, has_active_ai_provider: false });
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [versionInfo, setVersionInfo] = useState({ version: '...', commit: '...' });
    const [authStatus, setAuthStatus] = useState(null);
    const [targetNamespace, setTargetNamespace] = useState('');
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        
        fetch('/api/settings')
            .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch')))
            .then(data => {
                if(isMounted.current) {
                    setStatus(data);
                    setIsLoading(false);
                }
            })
            .catch(err => {
                console.error("Failed to fetch settings status:", err);
                if(isMounted.current) setIsLoading(false);
            });
        
        fetch('/api/version')
            .then(res => res.json())
            .then(data => { if(isMounted.current) setVersionInfo(data) })
            .catch(err => console.error("Failed to fetch version:", err));

        fetch('/api/auth/status')
            .then(res => res.json())
            .then(data => {
                if(isMounted.current) {
                    setAuthStatus(data);
                    if (data.namespace) setTargetNamespace(data.namespace);
                }
            })
            .catch(err => console.error("Failed to fetch auth status:", err));
            
        return () => { isMounted.current = false; };
    }, []);

    const handleSave = (e) => {
        e.preventDefault();
        setMessage({ text: 'Saving...', type: 'info' });

        const payload = {};
        if (touched.github) payload.github_pat = githubPat.trim();
        if (touched.gemini) payload.gemini_api_key = geminiKey.trim();
        if (touched.claude) payload.claude_api_key = claudeKey.trim();

        if (Object.keys(payload).length === 0) {
             setMessage({ text: 'Nothing to update.', type: 'info' });
             return;
        }

        fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (res.ok) {
                if(isMounted.current) {
                    setMessage({ text: 'Settings updated successfully!', type: 'success' });
                    setGithubPat('');
                    setGeminiKey('');
                    setClaudeKey('');
                    setTouched({ github: false, gemini: false, claude: false });
                }
            } else {
                return res.json().then(data => Promise.reject(new Error(data.error || 'Failed to update settings')));
            }
        })
        .catch(err => {
            console.error(err);
            if(isMounted.current) setMessage({ text: err.message || 'Error updating settings.', type: 'error' });
        })
        .finally(() => {
            fetch('/api/settings')
                .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch')))
                .then(data => { if(isMounted.current) setStatus(data); })
                .catch(err => console.error(err));
        });
    };

    const handleSwitchNamespace = (e) => {
        e.preventDefault();
        if (!targetNamespace && !window.confirm("Switching to empty namespace will reset to your default user namespace. Continue?")) return;

        fetch('/api/auth/switch-namespace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ namespace: targetNamespace })
        })
        .then(res => {
            if (res.ok) {
                window.location.reload(); 
            } else {
                res.json().then(data => {
                    if(isMounted.current) setMessage({ text: 'Failed to switch namespace: ' + (data.error || 'Unknown error'), type: 'error' });
                }).catch(() => {
                    if(isMounted.current) setMessage({ text: 'Failed to switch namespace.', type: 'error' });
                });
            }
        })
        .catch(err => {
             console.error(err);
             if(isMounted.current) setMessage({ text: 'Error switching namespace.', type: 'error' });
        });
    };

    const handleClearPat = () => {
        if (!window.confirm("Are you sure you want to clear your manual PAT? The application will fall back to your OAuth login token if available.")) return;
        
        fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ github_pat: "" })
        })
        .then(res => {
            if (res.ok) {
                if(isMounted.current) setMessage({ text: 'Manual PAT cleared.', type: 'success' });
            } else {
                throw new Error('Failed to clear PAT');
            }
        })
        .catch(err => {
            if(isMounted.current) setMessage({ text: 'Error clearing PAT.', type: 'error' });
        })
        .finally(() => {
            fetch('/api/settings')
                .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch')))
                .then(data => { if(isMounted.current) setStatus(data); })
                .catch(err => console.error(err));
        });
    };

    if (isLoading) return <div className="settings-container"><p>Loading settings...</p></div>;

    return (
        <div className="settings-container">
            <h2>User Settings</h2>
            <p>Configure your personal access tokens. These are stored securely in your private namespace.</p>
            
            {message.text && <div className={`message ${message.type}`}>{message.text}</div>}

            <form onSubmit={handleSave} className="settings-form">
                <div className="form-group">
                    <label htmlFor="githubPat">GitHub Personal Access Token (PAT):</label>
                    <div className="status-info">
                        {status.manual_pat_set ? (
                            <span className="status-badge set">✅ Manual PAT Configured</span>
                        ) : status.oauth_pat_set ? (
                            <span className="status-badge oauth">ℹ️ Using OAuth Login Token</span>
                        ) : status.github_pat_set ? (
                             <span className="status-badge set">✅ Legacy PAT Configured</span>
                        ) : (
                            <span className="status-badge missing">⚠️ No Token Configured</span>
                        )}
                    </div>
                    <div className="input-status-wrapper">
                        <input
                            type="password"
                            id="githubPat"
                            name="githubPat"
                            autoComplete="new-password"
                            maxLength={512}
                            aria-describedby="githubPatHelp"
                            value={githubPat}
                            onChange={(e) => { setGithubPat(e.target.value); setTouched(prev => ({...prev, github: true})) }}
                            placeholder={status.manual_pat_set ? "Set - leave blank to keep" : "Enter Manual PAT"}
                        />
                        {status.manual_pat_set && (
                            <button type="button" className="btn btn-delete btn-sm" onClick={handleClearPat} style={{marginLeft: '10px'}}>Clear Manual PAT</button>
                        )}
                    </div>
                    <small id="githubPatHelp">
                        Manual PAT takes precedence over OAuth login. 
                        You can generate a <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">GitHub Classic PAT</a> with 'repo' (read/write) permissions.
                        {status.oauth_pat_set && !status.manual_pat_set && " You are currently using your GitHub login session."}
                    </small>
                </div>

                <div className="form-group">
                    <label htmlFor="geminiKey">Gemini API Key:</label>
                    <div className="input-status-wrapper">
                        <input
                            type="password"
                            id="geminiKey"
                            name="geminiKey"
                            autoComplete="new-password"
                            maxLength={512}
                            aria-describedby="geminiKeyHelp"
                            value={geminiKey}
                            onChange={(e) => { setGeminiKey(e.target.value); setTouched(prev => ({...prev, gemini: true})) }}
                            placeholder={status.gemini_api_key_set ? "Set - leave blank to keep" : "Enter API Key"}
                        />
                         <span className={`status-badge ${status.gemini_api_key_set ? 'set' : 'missing'}`}>
                            {status.gemini_api_key_set ? '✅ Configured' : '⚠️ Not Set'}
                        </span>
                    </div>
                    <p id="geminiKeyHelp" style={{ fontSize: '0.9rem', marginTop: '5px' }}>
                        Required for AI-powered reviews and triage. 
                        Check your <a href="https://ai.dev/rate-limit" target="_blank" rel="noopener noreferrer">token usage</a>.
                    </p>
                </div>

                <div className="form-group">
                    <label htmlFor="claudeKey">Claude API Key:</label>
                    <div className="input-status-wrapper">
                        <input
                            type="password"
                            id="claudeKey"
                            name="claudeKey"
                            autoComplete="new-password"
                            maxLength={512}
                            aria-describedby="claudeKeyHelp"
                            value={claudeKey}
                            onChange={(e) => { setClaudeKey(e.target.value); setTouched(prev => ({...prev, claude: true})) }}
                            placeholder={status.claude_api_key_set ? "Set - leave blank to keep" : "Enter API Key"}
                        />
                         <span className={`status-badge ${status.claude_api_key_set ? 'set' : 'missing'}`}>
                            {status.claude_api_key_set ? '✅ Configured' : '⚠️ Not Set'}
                        </span>
                    </div>
                    <p id="claudeKeyHelp" style={{ fontSize: '0.9rem', marginTop: '5px' }}>
                        Required for Claude-powered analysis.
                        You can generate it from the <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">Anthropic API console</a>.
                    </p>
                </div>

                <div className="form-actions">
                    <button type="submit" className="btn btn-submit">Save Settings</button>
                    <button type="button" className="btn" onClick={onBack}>Back to Dashboard</button>
                </div>
            </form>
            
            {authStatus && authStatus.isAdmin && (
                <div className="admin-section" style={{marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '20px'}}>
                    <h3>Admin: Namespace Switching</h3>
                    <p>Current Namespace: <strong>{authStatus.namespace}</strong></p>
                    <form onSubmit={handleSwitchNamespace} className="settings-form">
                         <div className="form-group">
                            <label htmlFor="targetNamespace">Target Namespace:</label>
                            <div className="input-status-wrapper">
                                <input
                                    type="text"
                                    id="targetNamespace"
                                    value={targetNamespace}
                                    onChange={(e) => setTargetNamespace(e.target.value)}
                                    placeholder="Enter namespace"
                                />
                                <button type="submit" className="btn btn-submit" style={{marginLeft: '10px'}}>Switch</button>
                            </div>
                            <small>Enter the namespace you want to manage. Leave empty to return to your default namespace.</small>
                         </div>
                    </form>
                </div>
            )}
            
            <div className="about-section" style={{marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '20px', color: '#666', fontSize: '0.9em'}}>
                <h3 style={{fontSize: '1.1em', marginBottom: '10px'}}>About Repo Agent</h3>
                <p style={{margin: '5px 0'}}><strong>Version:</strong> {versionInfo.version}</p>
                <p style={{margin: '5px 0'}}><strong>Git Commit:</strong> <code style={{background: '#f5f5f5', padding: '2px 5px', borderRadius: '3px'}}>{versionInfo.commit}</code></p>
            </div>
        </div>
    );
}

export default Settings;
