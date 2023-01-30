import type { CompilerOptions } from 'typescript';
import { dirname, join, isAbsolute } from './path';
import { resolvePathMappings } from './mappings';

const noMatch = [undefined, false] as [undefined, false];

type PathResolve = (id: string) => string | undefined;

export type Resolver = (
  id: string
) => [resolved: string | undefined, matched: boolean];

export function configToResolveIdByPaths(
  compilerOptions: CompilerOptions,
  configFilePath: string
) {
  const resolvers: Resolver[] = [];
  const resolver = createResolver(compilerOptions, configFilePath);
  if (resolver) {
    resolvers.push(resolver);
  }

  return function (id: string) {
    if (!isAbsolute(id)) {
      for (const resolve of resolvers) {
        const [resolved, matched] = resolve(id);
        if (resolved) {
          return resolved;
        }
        if (matched) {
          // Once a matching resolver is found, stop looking.
          return resolved;
        }
      }
    }
  };
}

function createResolver(
  options: CompilerOptions,
  configFilePath: string
): Resolver | null {
  const { baseUrl, paths } = options;
  if (!baseUrl && !paths) {
    return null;
  }

  type InternalResolver = (id: string) => string | undefined;

  const resolveWithBaseUrl: InternalResolver | undefined = baseUrl
    ? (id) => join(baseUrl, id)
    : undefined;

  let resolveId: InternalResolver;
  if (paths) {
    const pathMappings = resolvePathMappings(
      paths,
      options.baseUrl ?? dirname(configFilePath)
    );
    const resolveWithPaths: InternalResolver = (id) => {
      for (const mapping of pathMappings) {
        const match = id.match(mapping.pattern);
        if (!match) {
          continue;
        }
        for (let pathTemplate of mapping.paths) {
          let starCount = 0;
          const mappedId = pathTemplate.replace(/\*/g, () => {
            // There may exist more globs in the path template than in
            // the match pattern. In that case, we reuse the final
            // glob match.
            const matchIndex = Math.min(++starCount, match.length - 1);
            return match[matchIndex];
          });
          const resolved = mappedId;
          if (resolved) {
            return resolved;
          }
        }
      }
    };

    if (resolveWithBaseUrl) {
      resolveId = (id) => {
        const resolved = resolveWithPaths(id);
        if (isPackageName(id)) {
          return resolved;
        } else {
          return resolved ?? resolveWithBaseUrl(id);
        }
      };
    } else {
      resolveId = resolveWithPaths;
    }
  } else {
    resolveId = resolveWithBaseUrl!;
  }
  const resolutionCache = new Map<string, string>();
  return (id) => {
    // Skip virtual modules.
    if (id.includes('\0')) {
      return noMatch;
    }

    let path = resolutionCache.get(id);
    if (!path) {
      path = resolveId(id);
      if (path) {
        resolutionCache.set(id, path);
      }
    }
    return [path, true];
  };
}

function isPackageName(id: string) {
  if (id[0] === '@') return true;

  if (id.indexOf('.') >= 0 || id.indexOf('..') >= 0) {
    return false;
  } else {
    return true;
  }
}
