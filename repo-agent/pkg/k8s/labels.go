/*
Copyright 2026.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package k8s

import (
	"crypto/sha256"
	"fmt"
	"regexp"
	"strings"
)

// TruncateLabel ensures a string is a valid Kubernetes label value (<= 63 chars).
// It handles unicode safe truncation, and if the string ends up empty or is truncated,
// it appends a short hash to maintain some uniqueness.
func TruncateLabel(s string) string {
	original := s
	if s == "" {
		return "empty"
	}

	// 1. Lowercase and Sanitize middle characters
	// Kubernetes label values must consist of alphanumeric characters, '-', '_' or '.'
	s = strings.ToLower(s)
	reSanitize := regexp.MustCompile(`[^a-z0-9._-]`)
	s = reSanitize.ReplaceAllString(s, "-")
	// Collapse multiple dashes for cleaner labels
	reDashes := regexp.MustCompile(`-+`)
	s = reDashes.ReplaceAllString(s, "-")

	// 2. Unicode safe truncation
	runes := []rune(s)
	truncated := false
	if len(runes) > 63 {
		runes = runes[:63]
		truncated = true
	}
	s = string(runes)

	// 3. Uniqueness via hashing if truncated
	if truncated {
		hash := sha256.Sum256([]byte(original))
		// Append short hash (6 hex chars) and truncate to exactly 63 if needed.
		// 56 runes + 1 dash + 6 hex chars = 63 characters.
		s = fmt.Sprintf("%s-%x", string(runes[:56]), hash[:3])
	}

	// 4. Robust Alphanumeric Trimming
	// Kubernetes labels must start and end with an alphanumeric character ([a-z0-9A-Z])
	// Trim non-alphanumeric from both ends in one pass.
	reEnds := regexp.MustCompile(`^[^a-z0-9]+|[^a-z0-9]+$`)
	s = reEnds.ReplaceAllString(s, "")

	if s == "" {
		// Use a hash of the original input if it ends up empty after trimming
		hash := sha256.Sum256([]byte(original))
		return fmt.Sprintf("fallback-%x", hash[:4])
	}

	return s
}

// Slugify converts a string to a safe slug for use in Kubernetes names/labels.
func Slugify(s string) string {
	// 1. Lowercase
	s = strings.ToLower(s)

	// 2. Replace non-alphanumeric with dashes
	re := regexp.MustCompile(`[^a-z0-9]+`)
	s = re.ReplaceAllString(s, "-")

	// 3. Trim dashes from both ends
	s = strings.Trim(s, "-")

	// 4. Collapse multiple dashes
	re2 := regexp.MustCompile(`-+`)
	s = re2.ReplaceAllString(s, "-")

	return s
}
