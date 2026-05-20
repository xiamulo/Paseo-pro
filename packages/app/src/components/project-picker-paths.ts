export function normalizeProjectDirectoryPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  let normalized = trimmed;
  while (!isRootPath(normalized) && /[\\/]$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function getProjectDirectoryName(path: string): string {
  const normalized = normalizeProjectDirectoryPath(path);
  if (!normalized) {
    return "";
  }
  if (isRootPath(normalized)) {
    return normalized;
  }

  const separatorIndex = findLastSeparatorIndex(normalized);
  return separatorIndex === -1 ? normalized : normalized.slice(separatorIndex + 1);
}

export function getParentProjectDirectory(path: string): string | null {
  const normalized = normalizeProjectDirectoryPath(path);
  if (!normalized || isRootPath(normalized)) {
    return null;
  }

  const separatorIndex = findLastSeparatorIndex(normalized);
  if (separatorIndex === -1) {
    return null;
  }

  if (separatorIndex === 0) {
    return normalized.slice(0, 1);
  }

  const driveRootMatch = /^[A-Za-z]:[\\/]$/.exec(normalized.slice(0, separatorIndex + 1));
  if (driveRootMatch) {
    return driveRootMatch[0];
  }

  return normalized.slice(0, separatorIndex);
}

export function joinProjectDirectoryPath(parent: string, childName: string): string {
  const normalizedParent = normalizeProjectDirectoryPath(parent);
  const normalizedChild = childName.trim();
  if (!normalizedParent) {
    return normalizedChild;
  }
  if (!normalizedChild) {
    return normalizedParent;
  }

  const separator = getPreferredSeparator(normalizedParent);
  if (normalizedParent === "/") {
    return `/${normalizedChild}`;
  }
  if (/^[A-Za-z]:$/.test(normalizedParent)) {
    return `${normalizedParent}${separator}${normalizedChild}`;
  }
  return `${normalizedParent}${separator}${normalizedChild}`;
}

export function deriveInitialProjectBrowseDirectory(input: {
  recommendedPaths: string[];
  fallbackDirectory: string | null;
}): string | null {
  const firstRecommendedPath = input.recommendedPaths
    .map(normalizeProjectDirectoryPath)
    .find((path) => path.length > 0);

  if (firstRecommendedPath) {
    return getParentProjectDirectory(firstRecommendedPath) ?? firstRecommendedPath;
  }

  return input.fallbackDirectory ? normalizeProjectDirectoryPath(input.fallbackDirectory) : null;
}

export function resolveProjectDirectoryInput(input: {
  value: string;
  homeDirectory: string | null;
}): string | null {
  const normalizedValue = normalizeProjectDirectoryPath(input.value);
  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue === "~") {
    return input.homeDirectory ? normalizeProjectDirectoryPath(input.homeDirectory) : null;
  }

  if (normalizedValue.startsWith("~/") || normalizedValue.startsWith("~\\")) {
    const homeDirectory = input.homeDirectory
      ? normalizeProjectDirectoryPath(input.homeDirectory)
      : null;
    if (!homeDirectory) {
      return null;
    }
    return joinProjectDirectoryPath(homeDirectory, normalizedValue.slice(2));
  }

  if (isAbsoluteProjectDirectoryPath(normalizedValue)) {
    return normalizedValue;
  }

  return null;
}

function findLastSeparatorIndex(path: string): number {
  return Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
}

function getPreferredSeparator(path: string): "\\" | "/" {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

function isRootPath(path: string): boolean {
  if (path === "/" || /^[A-Za-z]:[\\/]?$/.test(path)) {
    return true;
  }
  return /^\\\\[^\\/]+[\\/]?[^\\/]*[\\/]?$/.test(path);
}

function isAbsoluteProjectDirectoryPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}
