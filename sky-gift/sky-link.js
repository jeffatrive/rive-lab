// Sky link codec. Everything lives in the URL #fragment, which browsers never send to a server.
//   sky.html#t=1990-06-15T21:30&tz=-5&lat=41.88&lon=-87.63&pl=Chicago&n=Everett
//   t   local date and time at the place, YYYY-MM-DDTHH:MM
//   tz  hours ahead of UTC at that moment (-5 = Chicago in summer; may be fractional, 5.5)
//   lat, lon  degrees, north and east positive
//   pl  place label        n  recipient's name
var SkyLink = (function () {
  function num(v, lo, hi) {
    if (v === null || v === '') return null;
    var x = Number(v);
    return isFinite(x) && x >= lo && x <= hi ? x : null;
  }
  function decode(hash) {
    var q = new URLSearchParams((hash || '').replace(/^#/, ''));
    var sky = { name: (q.get('n') || '').slice(0, 60), place: (q.get('pl') || '').slice(0, 80), when: null,
      tz: num(q.get('tz'), -12, 14), lat: num(q.get('lat'), -90, 90), lon: num(q.get('lon'), -180, 180) };
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(q.get('t') || '');
    if (m) {
      var w = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
      if (w.year >= 1800 && w.year <= 2200 && w.month >= 1 && w.month <= 12 && w.day >= 1 && w.day <= 31 &&
          w.hour <= 23 && w.minute <= 59) sky.when = w;
    }
    // A sky needs all four; a partial link falls back to the file's own example.
    sky.complete = !!sky.when && sky.tz !== null && sky.lat !== null && sky.lon !== null;
    return sky;
  }
  function encode(sky) {
    var q = new URLSearchParams();
    var w = sky.when, p = function (n) { return (n < 10 ? '0' : '') + n; };
    q.set('t', w.year + '-' + p(w.month) + '-' + p(w.day) + 'T' + p(w.hour) + ':' + p(w.minute));
    q.set('tz', String(sky.tz));
    q.set('lat', String(sky.lat));
    q.set('lon', String(sky.lon));
    if (sky.place) q.set('pl', sky.place);
    if (sky.name) q.set('n', sky.name);
    return q.toString();
  }
  // "June 15, 1990 at 9:30 PM": the clock time as given, no time zone conversion.
  function dateText(w) {
    var d = new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute));
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(d);
  }
  return { decode: decode, encode: encode, dateText: dateText };
})();
