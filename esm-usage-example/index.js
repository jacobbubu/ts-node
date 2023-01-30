import { other } from '@ts-esm/foo/other';

async function main() {
  const fooModule = await import('@ts-esm/foo');
  console.dir({foo: fooModule})

  console.dir({other })
}
main()
