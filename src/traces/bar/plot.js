/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/


'use strict';

var d3 = require('d3');
var isNumeric = require('fast-isnumeric');

var Lib = require('../../lib');
var svgTextUtils = require('../../lib/svg_text_utils');

var Color = require('../../components/color');
var Drawing = require('../../components/drawing');
var Registry = require('../../registry');
var tickText = require('../../plots/cartesian/axes').tickText;

var attributes = require('./attributes');
var attributeText = attributes.text;
var attributeTextPosition = attributes.textposition;
var style = require('./style');
var helpers = require('./helpers');

// padding in pixels around text
var TEXTPAD = 3;

function dirSign(a, b) {
    return (a < b) ? 1 : -1;
}

function getXY(di, xa, ya, isHorizontal) {
    var s = [];
    var p = [];

    var sAxis = isHorizontal ? xa : ya;
    var pAxis = isHorizontal ? ya : xa;

    s[0] = sAxis.c2p(di.s0, true);
    p[0] = pAxis.c2p(di.p0, true);

    s[1] = sAxis.c2p(di.s1, true);
    p[1] = pAxis.c2p(di.p1, true);

    return isHorizontal ? [s, p] : [p, s];
}

module.exports = function plot(gd, plotinfo, cdModule, traceLayer, opts) {
    var xa = plotinfo.xaxis;
    var ya = plotinfo.yaxis;
    var fullLayout = gd._fullLayout;

    if(!opts) {
        opts = {
            mode: fullLayout.barmode,
            norm: fullLayout.barmode,
            gap: fullLayout.bargap,
            groupgap: fullLayout.bargroupgap
        };
    }

    var bartraces = Lib.makeTraceGroups(traceLayer, cdModule, 'trace bars').each(function(cd) {
        var plotGroup = d3.select(this);
        var trace = cd[0].trace;

        var adjustPixel = 0;
        if(trace.type === 'waterfall' && trace.connector.visible && trace.connector.mode === 'between') {
            adjustPixel = trace.connector.line.width / 2;
        }

        var isHorizontal = (trace.orientation === 'h');

        if(!plotinfo.isRangePlot) cd[0].node3 = plotGroup;

        var pointGroup = Lib.ensureSingle(plotGroup, 'g', 'points');

        var bars = pointGroup.selectAll('g.point').data(Lib.identity);

        bars.enter().append('g')
            .classed('point', true);

        bars.exit().remove();

        bars.each(function(di, i) {
            var bar = d3.select(this);

            // now display the bar
            // clipped xf/yf (2nd arg true): non-positive
            // log values go off-screen by plotwidth
            // so you see them continue if you drag the plot

            var xy = getXY(di, xa, ya, isHorizontal);

            var x0 = xy[0][0];
            var x1 = xy[0][1];
            var y0 = xy[1][0];
            var y1 = xy[1][1];

            var isBlank = di.isBlank = (
                !isNumeric(x0) || !isNumeric(x1) ||
                !isNumeric(y0) || !isNumeric(y1) ||
                x0 === x1 || y0 === y1
            );

            // in waterfall mode `between` we need to adjust bar end points to match the connector width
            if(adjustPixel) {
                if(isHorizontal) {
                    x0 -= dirSign(x0, x1) * adjustPixel;
                    x1 += dirSign(x0, x1) * adjustPixel;
                } else {
                    y0 -= dirSign(y0, y1) * adjustPixel;
                    y1 += dirSign(y0, y1) * adjustPixel;
                }
            }

            var lw;
            var mc;

            if(trace.type === 'waterfall') {
                if(!isBlank) {
                    var cont = trace[di.dir].marker;
                    lw = cont.line.width;
                    mc = cont.color;
                }
            } else {
                lw = (di.mlw + 1 || trace.marker.line.width + 1 ||
                    (di.trace ? di.trace.marker.line.width : 0) + 1) - 1;
                mc = di.mc || trace.marker.color;
            }

            var offset = d3.round((lw / 2) % 1, 2);

            function roundWithLine(v) {
                // if there are explicit gaps, don't round,
                // it can make the gaps look crappy
                return (opts.gap === 0 && opts.groupgap === 0) ?
                    d3.round(Math.round(v) - offset, 2) : v;
            }

            function expandToVisible(v, vc) {
                // if it's not in danger of disappearing entirely,
                // round more precisely
                return Math.abs(v - vc) >= 2 ? roundWithLine(v) :
                // but if it's very thin, expand it so it's
                // necessarily visible, even if it might overlap
                // its neighbor
                (v > vc ? Math.ceil(v) : Math.floor(v));
            }

            if(!gd._context.staticPlot) {
                // if bars are not fully opaque or they have a line
                // around them, round to integer pixels, mainly for
                // safari so we prevent overlaps from its expansive
                // pixelation. if the bars ARE fully opaque and have
                // no line, expand to a full pixel to make sure we
                // can see them

                var op = Color.opacity(mc);
                var fixpx = (op < 1 || lw > 0.01) ? roundWithLine : expandToVisible;
                x0 = fixpx(x0, x1);
                x1 = fixpx(x1, x0);
                y0 = fixpx(y0, y1);
                y1 = fixpx(y1, y0);
            }

            Lib.ensureSingle(bar, 'path')
                .style('vector-effect', 'non-scaling-stroke')
                .attr('d', isBlank ? 'M0,0Z' : 'M' + x0 + ',' + y0 + 'V' + y1 + 'H' + x1 + 'V' + y0 + 'Z')
                .call(Drawing.setClipUrl, plotinfo.layerClipId, gd);

            appendBarText(gd, plotinfo, bar, cd, i, x0, x1, y0, y1, opts);

            if(plotinfo.layerClipId) {
                Drawing.hideOutsideRangePoint(di, bar.select('text'), xa, ya, trace.xcalendar, trace.ycalendar);
            }
        });

        // lastly, clip points groups of `cliponaxis !== false` traces
        // on `plotinfo._hasClipOnAxisFalse === true` subplots
        var hasClipOnAxisFalse = trace.cliponaxis === false;
        Drawing.setClipUrl(plotGroup, hasClipOnAxisFalse ? null : plotinfo.layerClipId, gd);
    });

    // error bars are on the top
    Registry.getComponentMethod('errorbars', 'plot')(gd, bartraces, plotinfo);
};

function appendBarText(gd, plotinfo, bar, calcTrace, i, x0, x1, y0, y1, opts) {
    var xa = plotinfo.xaxis;
    var ya = plotinfo.yaxis;

    var fullLayout = gd._fullLayout;
    var textPosition;

    function appendTextNode(bar, text, textFont) {
        var textSelection = Lib.ensureSingle(bar, 'text')
            .text(text)
            .attr({
                'class': 'bartext bartext-' + textPosition,
                transform: '',
                'text-anchor': 'middle',
                // prohibit tex interpretation until we can handle
                // tex and regular text together
                'data-notex': 1
            })
            .call(Drawing.font, textFont)
            .call(svgTextUtils.convertToTspans, gd);

        return textSelection;
    }

    // get trace attributes
    var trace = calcTrace[0].trace;
    var isHorizontal = (trace.orientation === 'h');

    var text = getText(calcTrace, i, xa, ya);
    textPosition = getTextPosition(trace, i);

    // compute text position
    var inStackOrRelativeMode =
        opts.mode === 'stack' ||
        opts.mode === 'relative';

    var calcBar = calcTrace[i];
    var isOutmostBar = !inStackOrRelativeMode || calcBar._outmost;

    if(!text ||
        textPosition === 'none' ||
        (calcBar.isBlank && (
            textPosition === 'auto' ||
            textPosition === 'inside'))) {
        bar.select('text').remove();
        return;
    }

    var layoutFont = fullLayout.font;
    var barColor = style.getBarColor(calcTrace[i], trace);
    var insideTextFont = style.getInsideTextFont(trace, i, layoutFont, barColor);
    var outsideTextFont = style.getOutsideTextFont(trace, i, layoutFont);

    // Special case: don't use the c2p(v, true) value on log size axes,
    // so that we can get correctly inside text scaling
    var di = bar.datum();
    if(isHorizontal) {
        if(xa.type === 'log' && di.s0 <= 0) {
            if(xa.range[0] < xa.range[1]) {
                x0 = 0;
            } else {
                x0 = xa._length;
            }
        }
    } else {
        if(ya.type === 'log' && di.s0 <= 0) {
            if(ya.range[0] < ya.range[1]) {
                y0 = ya._length;
            } else {
                y0 = 0;
            }
        }
    }

    // padding excluded
    var barWidth = Math.abs(x1 - x0) - 2 * TEXTPAD;
    var barHeight = Math.abs(y1 - y0) - 2 * TEXTPAD;

    var textSelection;
    var textBB;
    var textWidth;
    var textHeight;

    if(textPosition === 'outside') {
        if(!isOutmostBar && !calcBar.hasB) textPosition = 'inside';
    }

    if(textPosition === 'auto') {
        if(isOutmostBar) {
            // draw text using insideTextFont and check if it fits inside bar
            textPosition = 'inside';
            textSelection = appendTextNode(bar, text, insideTextFont);

            textBB = Drawing.bBox(textSelection.node()),
            textWidth = textBB.width,
            textHeight = textBB.height;

            var textHasSize = (textWidth > 0 && textHeight > 0);
            var fitsInside = (textWidth <= barWidth && textHeight <= barHeight);
            var fitsInsideIfRotated = (textWidth <= barHeight && textHeight <= barWidth);
            var fitsInsideIfShrunk = (isHorizontal) ?
                (barWidth >= textWidth * (barHeight / textHeight)) :
                (barHeight >= textHeight * (barWidth / textWidth));

            if(textHasSize && (
                fitsInside ||
                fitsInsideIfRotated ||
                fitsInsideIfShrunk)
            ) {
                textPosition = 'inside';
            } else {
                textPosition = 'outside';
                textSelection.remove();
                textSelection = null;
            }
        } else {
            textPosition = 'inside';
        }
    }

    if(!textSelection) {
        textSelection = appendTextNode(bar, text,
                (textPosition === 'outside') ?
                outsideTextFont : insideTextFont);

        textBB = Drawing.bBox(textSelection.node()),
        textWidth = textBB.width,
        textHeight = textBB.height;

        if(textWidth <= 0 || textHeight <= 0) {
            textSelection.remove();
            return;
        }
    }

    // compute text transform
    var transform, constrained;
    if(textPosition === 'outside') {
        constrained =
            trace.constraintext === 'both' ||
            trace.constraintext === 'outside';

        transform = getTransformToMoveOutsideBar(x0, x1, y0, y1, textBB,
            isHorizontal, constrained, trace.textangle);
    } else {
        constrained =
            trace.constraintext === 'both' ||
            trace.constraintext === 'inside';

        transform = getTransformToMoveInsideBar(x0, x1, y0, y1, textBB,
            isHorizontal, constrained, trace.textangle, trace.insidetextanchor);
    }

    textSelection.attr('transform', transform);
}

function getRotationFromAngle(angle) {
    return (angle === 'auto') ? 0 : angle;
}

function getTransformToMoveInsideBar(x0, x1, y0, y1, textBB, isHorizontal, constrained, angle, anchor) {
    // compute text and target positions
    var textWidth = textBB.width;
    var textHeight = textBB.height;
    var textX = (textBB.left + textBB.right) / 2;
    var textY = (textBB.top + textBB.bottom) / 2;

    var autoRotate = (angle === 'auto');
    var rotation = getRotationFromAngle(angle);

    var sin = Math.sin(rotation);
    var cos = Math.cos(rotation);

    var lx = Math.abs(x1 - x0);
    var ly = Math.abs(y1 - y0);

    var dx = Math.max(lx * Math.abs(cos), ly * Math.abs(sin));
    var dy = Math.max(lx * Math.abs(sin), ly * Math.abs(cos));

    // apply text padding
    var textpad;
    if(dx > (2 * TEXTPAD) && dy > (2 * TEXTPAD)) {
        textpad = TEXTPAD;
        dx -= 2 * textpad;
        dy -= 2 * textpad;
    } else textpad = 0;

    // compute rotation and scale
    var scale = 1;
    if(textWidth <= dx && textHeight <= dy) {
        // no scale or rotation is required
    } else if(textWidth <= dy && textHeight <= dx && autoRotate) {
        rotation = 90;
    } else if(((textWidth < textHeight) === (dx < dy)) || !autoRotate) {
        if(constrained) scale = Math.min(dx / textWidth, dy / textHeight);
    } else {
        rotation = 90;
        if(constrained) scale = Math.min(dy / textWidth, dx / textHeight);
    }

    // compute text and target positions
    var targetX = (x0 + x1) / 2;
    var targetY = (y0 + y1) / 2;

    if(anchor !== 'middle') {
        var targetWidth = scale * Math.abs(textWidth * Math.cos(rotation) - textHeight * Math.sin(rotation));
        var targetHeight = scale * Math.abs(textWidth * Math.sin(rotation) - textHeight * Math.cos(rotation));

        var offset;
        if(isHorizontal) {
            offset = (textpad + targetWidth / 2) * dirSign(x0, x1);
            if(anchor === 'start') {
                targetX = x0 + offset;
            } else { // case 'end'
                targetX = x1 - offset;
            }
        } else {
            offset = (textpad + targetHeight / 2) * dirSign(y0, y1);
            if(anchor === 'start') {
                targetY = y0 + offset;
            } else { // case 'end'
                targetY = y1 - offset;
            }
        }
    }

    return getTransform(textX, textY, targetX, targetY, scale, rotation);
}

function getTransformToMoveOutsideBar(x0, x1, y0, y1, textBB, isHorizontal, constrained, angle) {
    var barWidth = (isHorizontal) ?
        Math.abs(y1 - y0) :
        Math.abs(x1 - x0);
    var textpad;

    // Keep the padding so the text doesn't sit right against
    // the bars, but don't factor it into barWidth
    if(barWidth > 2 * TEXTPAD) {
        textpad = TEXTPAD;
    }

    // compute rotation and scale
    var scale = 1;
    if(constrained) {
        scale = (isHorizontal) ?
            Math.min(1, barWidth / textBB.height) :
            Math.min(1, barWidth / textBB.width);
    }

    // compute text and target positions
    var textX = (textBB.left + textBB.right) / 2;
    var textY = (textBB.top + textBB.bottom) / 2;

    var targetWidth = scale * textBB.width;
    var targetHeight = scale * textBB.height;

    var targetX = (x0 + x1) / 2;
    var targetY = (y0 + y1) / 2;

    if(isHorizontal) {
        targetX = x1 - (textpad + targetWidth / 2) * dirSign(x1, x0);
    } else {
        targetY = y1 + (textpad + targetHeight / 2) * dirSign(y0, y1);
    }

    var rotation = getRotationFromAngle(angle);

    return getTransform(textX, textY, targetX, targetY, scale, rotation);
}

function getTransform(textX, textY, targetX, targetY, scale, rotation) {
    var transformScale;
    var transformRotate;
    var transformTranslate;

    if(scale < 1) transformScale = 'scale(' + scale + ') ';
    else {
        scale = 1;
        transformScale = '';
    }

    transformRotate = (rotation) ?
        'rotate(' + rotation + ' ' + textX + ' ' + textY + ') ' : '';

    // Note that scaling also affects the center of the text box
    var translateX = (targetX - scale * textX);
    var translateY = (targetY - scale * textY);
    transformTranslate = 'translate(' + translateX + ' ' + translateY + ')';

    return transformTranslate + transformScale + transformRotate;
}

function getText(calcTrace, index, xa, ya) {
    var trace = calcTrace[0].trace;

    var value;
    if(!trace.textinfo || trace.textinfo === 'none') {
        value = helpers.getValue(trace.text, index);
    } else {
        value = calcTextinfo(calcTrace, index, xa, ya);
    }

    return helpers.coerceString(attributeText, value);
}

function getTextPosition(trace, index) {
    var value = helpers.getValue(trace.textposition, index);
    return helpers.coerceEnumerated(attributeTextPosition, value);
}

function calcTextinfo(calcTrace, index, xa, ya) {
    var trace = calcTrace[0].trace;
    var isHorizontal = (trace.orientation === 'h');

    function formatNumber(v) {
        var sAxis = isHorizontal ? xa : ya;
        return tickText(sAxis, +v, true).text;
    }

    var textinfo = trace.textinfo;
    var cdi = calcTrace[index];

    var parts = textinfo.split('+');
    var text = [];
    var tx;

    var hasFlag = function(flag) { return parts.indexOf(flag) !== -1; };

    if(hasFlag('label')) {
        // TODO: fix me to work with multicategory
        if(isHorizontal) {
            text.push(trace.y[index]);
        } else {
            text.push(trace.x[index]);
        }
    }

    if(hasFlag('text')) {
        tx = Lib.castOption(trace, cdi.i, 'text');
        if(tx) text.push(tx);
    }

    if(trace.type === 'waterfall') {
        var delta = +cdi.rawS || cdi.s;
        var final = cdi.v;
        var initial = final - delta;

        if(hasFlag('initial')) text.push(formatNumber(initial));
        if(hasFlag('delta')) text.push(formatNumber(delta));
        if(hasFlag('final')) text.push(formatNumber(final));
    }

    if(trace.type === 'funnel') {
        if(hasFlag('value')) text.push(formatNumber(cdi.s));

        var nPercent = 0;
        if(hasFlag('percent initial')) nPercent++;
        if(hasFlag('percent previous')) nPercent++;
        if(hasFlag('percent total')) nPercent++;

        var hasMultiplePercents = nPercent > 1;

        if(hasFlag('percent initial')) {
            tx = formatPercent(cdi.begR);
            if(hasMultiplePercents) tx += ' of initial';
            text.push(tx);
        }
        if(hasFlag('percent previous')) {
            tx = formatPercent(cdi.difR);
            if(hasMultiplePercents) tx += ' of previous';
            text.push(tx);
        }
        if(hasFlag('percent total')) {
            tx = formatPercent(cdi.sumR);
            if(hasMultiplePercents) tx += ' of total';
            text.push(tx);
        }
    }

    return text.join('<br>');
}

function formatPercent(ratio) {
    return Math.round(100 * ratio) + '%';
}
