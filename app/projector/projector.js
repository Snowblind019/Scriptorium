const stage = new ScripRender.Stage(document.getElementById('stage'));
stage.render({ view: 'clear' });
window.api.onState(s => stage.render(s));
window.api.onMediaCmd(c => stage.mediaCmd(c, st => window.api.mediaStatus(st)));
