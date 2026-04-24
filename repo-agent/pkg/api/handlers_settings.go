package api

import (
	"context"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gke-labs/gemini-for-kubernetes-development/repo-agent/pkg/k8s"
	"k8s.io/apimachinery/pkg/api/errors"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"
)

func (s *Server) getSettings(c *gin.Context) {
	namespace := s.Auth.GetNamespaceFromContext(c)
	settings := gin.H{
		"manual_pat_set":         false,
		"oauth_pat_set":          false,
		"github_pat_set":         false,
		"gemini_api_key_set":     false,
		"claude_api_key_set":     false,
		"has_active_ai_provider": false,
	}

	var wg sync.WaitGroup
	var mu sync.Mutex

	wg.Add(3)

	go func() {
		defer wg.Done()
		sec, err := s.K8sManager.Clientset.CoreV1().Secrets(namespace).Get(c.Request.Context(), k8s.GithubSecretName, v1.GetOptions{})
		if err == nil {
			mu.Lock()
			defer mu.Unlock()
			if _, ok := sec.Data[k8s.ManualPATKey]; ok {
				settings["manual_pat_set"] = true
				settings["github_pat_set"] = true
			}
			if _, ok := sec.Data[k8s.OAuthPATKey]; ok {
				settings["oauth_pat_set"] = true
				if !settings["manual_pat_set"].(bool) {
					settings["github_pat_set"] = true
				}
			}
			if !settings["manual_pat_set"].(bool) && !settings["oauth_pat_set"].(bool) {
				if _, ok := sec.Data["pat"]; ok {
					settings["github_pat_set"] = true
				}
			}
		} else if !errors.IsNotFound(err) {
			klog.Errorf("Failed to fetch Github secret in namespace %s: %v", namespace, err)
		}
	}()

	go func() {
		defer wg.Done()
		sec, err := s.K8sManager.Clientset.CoreV1().Secrets(namespace).Get(c.Request.Context(), k8s.GeminiSecretName, v1.GetOptions{})
		if err == nil {
			if val, ok := sec.Data["gemini"]; ok && len(val) > 0 {
				mu.Lock()
				settings["gemini_api_key_set"] = true
				settings["has_active_ai_provider"] = true
				mu.Unlock()
			}
		} else if !errors.IsNotFound(err) {
			klog.Errorf("Failed to fetch Gemini secret in namespace %s: %v", namespace, err)
		}
	}()

	go func() {
		defer wg.Done()
		sec, err := s.K8sManager.Clientset.CoreV1().Secrets(namespace).Get(c.Request.Context(), k8s.ClaudeSecretName, v1.GetOptions{})
		if err == nil {
			if val, ok := sec.Data["claude"]; ok && len(val) > 0 {
				mu.Lock()
				settings["claude_api_key_set"] = true
				settings["has_active_ai_provider"] = true
				mu.Unlock()
			}
		} else if !errors.IsNotFound(err) {
			klog.Errorf("Failed to fetch Claude secret in namespace %s: %v", namespace, err)
		}
	}()

	wg.Wait()
	c.JSON(http.StatusOK, settings)
}

func (s *Server) updateSettings(c *gin.Context) {
	namespace := s.Auth.GetNamespaceFromContext(c)
	var payload struct {
		GithubPAT    *string `json:"github_pat"` // Use pointer to distinguish between empty string and missing field
		GeminiAPIKey *string `json:"gemini_api_key" binding:"omitempty,max=512"`
		ClaudeAPIKey *string `json:"claude_api_key" binding:"omitempty,max=512"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := context.WithoutCancel(c.Request.Context())
	var errs []string

	if payload.GithubPAT != nil {
		patValue := strings.TrimSpace(*payload.GithubPAT)
		if patValue == "" {
			data := map[string][]byte{
				k8s.ManualPATKey: nil,
			}
			err := s.K8sManager.UpdateSecret(ctx, namespace, k8s.GithubSecretName, data, nil)
			if err != nil {
				klog.Errorf("Failed to clear GitHub PAT in namespace %s: %v", namespace, err)
				errs = append(errs, "Failed to clear GitHub PAT")
			}
		} else {
			data := map[string][]byte{
				k8s.ManualPATKey: []byte(patValue),
				"refresh_token":  nil,
				"expiry":         nil,
			}
			err := s.K8sManager.UpdateSecret(ctx, namespace, k8s.GithubSecretName, data, nil)
			if err != nil {
				klog.Errorf("Failed to update GitHub PAT in namespace %s: %v", namespace, err)
				errs = append(errs, "Failed to update GitHub PAT")
			}
		}
	}

	if payload.GeminiAPIKey != nil {
		geminiVal := strings.TrimSpace(*payload.GeminiAPIKey)
		if geminiVal == "" {
			err := s.K8sManager.UpdateSecret(ctx, namespace, k8s.GeminiSecretName, map[string][]byte{"gemini": nil}, nil)
			if err != nil {
				klog.Errorf("Failed to clear Gemini API Key in namespace %s: %v", namespace, err)
				errs = append(errs, "Failed to clear Gemini API Key")
			}
		} else {
			err := s.K8sManager.UpdateSecret(ctx, namespace, k8s.GeminiSecretName, map[string][]byte{"gemini": []byte(geminiVal)}, nil)
			if err != nil {
				klog.Errorf("Failed to update Gemini API Key in namespace %s: %v", namespace, err)
				errs = append(errs, "Failed to update Gemini API Key")
			}
		}
	}

	if payload.ClaudeAPIKey != nil {
		claudeVal := strings.TrimSpace(*payload.ClaudeAPIKey)
		if claudeVal == "" {
			err := s.K8sManager.UpdateSecret(ctx, namespace, k8s.ClaudeSecretName, map[string][]byte{"claude": nil}, nil)
			if err != nil {
				klog.Errorf("Failed to clear Claude API Key in namespace %s: %v", namespace, err)
				errs = append(errs, "Failed to clear Claude API Key")
			}
		} else {
			if !strings.HasPrefix(claudeVal, "sk-ant-") {
				errs = append(errs, "Claude API Key must start with 'sk-ant-'")
			} else {
				err := s.K8sManager.UpdateSecret(ctx, namespace, k8s.ClaudeSecretName, map[string][]byte{"claude": []byte(claudeVal)}, nil)
				if err != nil {
					klog.Errorf("Failed to update Claude API Key in namespace %s: %v", namespace, err)
					errs = append(errs, "Failed to update Claude API Key")
				}
			}
		}
	}

	if len(errs) > 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": strings.Join(errs, ", ")})
		return
	}

	c.Status(http.StatusOK)
}
