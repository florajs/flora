'use strict';

module.exports = function asciiArtProfile(profile, totalDuration, width) {
    if (totalDuration <= 0) return ['total duration = ' + totalDuration + 'ms!? Wow ... that was fast :-)'];
    if (width < 10) width = 10;

    return profile.map((measure) => {
        const beforeChar = '.';
        const afterChar = '.';
        let endChar = '';
        let beginChar = '';
        let durationChar = '#';
        let afterWidth;
        let description;

        let beforeWidth = Math.round((measure.startTime * width) / totalDuration);
        if (beforeWidth > width) {
            beforeWidth = width;
            beginChar = '>';
        }
        if (beforeWidth < 0) {
            beforeWidth = 0;
            beginChar = '<';
        }

        let durationWidth;
        if (measure.duration !== null) {
            durationWidth = Math.round((measure.duration * width) / totalDuration);
            if (durationWidth > width - beforeWidth) {
                durationWidth = width - beforeWidth;
            }
            if (measure.duration > totalDuration - measure.startTime) {
                endChar = '>';
            }
            if (durationWidth < 0) {
                durationWidth = 1;
                durationChar = '!';
                endChar = '<';
            }
            if (durationWidth < 1) {
                durationWidth = 1;
                durationChar = '|';
            }
            description = ' (' + measure.name + ' - ' + measure.duration + 'ms)';
        } else {
            durationWidth = width - beforeWidth;
            durationChar = '?';
            description = ' (' + measure.name + ' - still running!)';
        }

        afterWidth = width - beforeWidth - beginChar.length - durationWidth - endChar.length;
        if (afterWidth < 0) {
            if (durationWidth + afterWidth > 0) durationWidth += afterWidth;
            else if (beforeWidth + afterWidth > 0) beforeWidth += afterWidth;

            afterWidth = 0;
        }

        return (
            beforeChar.repeat(beforeWidth) +
            beginChar +
            durationChar.repeat(durationWidth) +
            endChar +
            afterChar.repeat(afterWidth) +
            description
        );
    });
};
