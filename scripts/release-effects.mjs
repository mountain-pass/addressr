const published = process.argv[2];
const publishedPackages = JSON.parse(process.argv[3] || '[]');

if (!Array.isArray(publishedPackages)) {
  throw new TypeError('published packages must be a JSON array');
}

if (published !== 'true' && published !== 'false') {
  throw new TypeError('published must be true or false');
}

if ((published === 'true') !== (publishedPackages.length > 0)) {
  throw new Error('published and publishedPackages outputs disagree');
}

if (
  publishedPackages.some(
    (publishedPackage) =>
      typeof publishedPackage?.name !== 'string' ||
      typeof publishedPackage?.version !== 'string',
  )
) {
  throw new TypeError('every published package must have a name and version');
}

const apiPublished = publishedPackages.some(
  (publishedPackage) => publishedPackage?.name === '@mountainpass/addressr',
);

process.stdout.write(`api-published=${apiPublished}\n`);
