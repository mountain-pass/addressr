import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        // { duration: '10s', target: 10 },
        // { duration: '1m30s', target: 20 },
        // { duration: '20s', target: 0 },
        { duration: '2m', target: 5 }, // below normal load
        { duration: '5m', target: 5 },
        { duration: '2m', target: 10 }, // normal load
        { duration: '5m', target: 10 },
        { duration: '2m', target: 15 }, // around the breaking point
        { duration: '5m', target: 15 },
        { duration: '2m', target: 20 }, // beyond the breaking point
        { duration: '5m', target: 20 },
        { duration: '10m', target: 0 }, // scale down. Recovery stage.
    ],
    thresholds: {
        'http_req_duration{name:search}': [{ threshold: 'p(95) < 16000', abortOnFail: false }],
        'http_req_duration{name:retrieve}': [{ threshold: 'p(95) < 16000', abortOnFail: false }],
        checks: [{ threshold: 'rate>0.9', abortOnFail: true }],
    },
};

function randomIntFromInterval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min)
}


function makeid(length) {
    var result = '';
    var characters = 'abcdefghijklmnopqrstuvwxyz';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}

export default function () {
    const query = `${randomIntFromInterval(1, 1000)}+${makeid(randomIntFromInterval(1, 3))}`;
    const url = http.url`http://localhost:6060/addresses?q=${query}`
    //console.log(url)
    const response = http.get(url, {
        tags: { name: 'search' },
    });
    check(response, {
        'is status 200': (r) => r.status === 200,
    });
    if (response.status === 200) {
        const results = JSON.parse(response.body);
        if (results.length > 0) {
            const nextUrl = results[randomIntFromInterval(0, results.length - 1)].links.self.href
            http.get(`http://localhost:6060${nextUrl}`, {
                tags: { name: 'retrieve' },
            });
        }
    }
    sleep(1)
}