const http = require('node:https');
const fs = require('node:fs');
const pathUtil = require('node:path');
import ProgressBar from 'progress';

module.exports = function streamDown(url, path, size) {
  const uri = new URL(url);
  if (!path) {
    path = pathUtil.basename(uri.pathname);
  }
  const file = fs.createWriteStream(path); // eslint-disable-line security/detect-non-literal-fs-filename -- path is internal

  return new Promise(function (resolve, reject) {
    http.get(uri.toString()).on('response', function (response) {
      const length = response.headers['content-length']
        ? Number.parseInt(response.headers['content-length'], 10)
        : size;
      //   let downloaded = 0;
      //   let percent = 0;
      var bar = new ProgressBar(
        '  downloading [:bar] :rate/bps :percent :etas',
        {
          complete: '=',
          incomplete: ' ',
          width: 20,
          total: length,
        },
      );

      response
        .on('data', function (chunk) {
          file.write(chunk);
          //   downloaded += chunk.length;
          //percent = ((100.0 * downloaded) / len).toFixed(2);
          bar.tick(chunk.length);
          //   process.stdout.write(
          //     `Downloading\t${percent}%\t${filesize(downloaded, {
          //       standard: 'iec',
          //     })}\t of ${filesize(len, {
          //       standard: 'iec',
          //     })}\t\t\t\t\t\t\r`,
          //   );
        })
        .on('end', function () {
          file.end();
          console.log(`\n${uri.pathname} downloaded to: ${path}`);
          resolve(response);
        })
        .on('error', function (error) {
          reject(error);
        });
    });
  });
};
