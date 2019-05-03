/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var Lib = require('../../lib');
var axisIds = require('../../plots/cartesian/axis_ids');

var traceIs = require('../../registry').traceIs;
var handleGroupingDefaults = require('../bar/defaults').handleGroupingDefaults;
var attributes = require('./attributes');

var nestedProperty = Lib.nestedProperty;

var BINATTRS = {
    x: [
        {aStr: 'xbins.start', name: 'start'},
        {aStr: 'xbins.end', name: 'end'},
        {aStr: 'xbins.size', name: 'size'},
        {aStr: 'nbinsx', name: 'nbins'}
    ],
    y: [
        {aStr: 'ybins.start', name: 'start'},
        {aStr: 'ybins.end', name: 'end'},
        {aStr: 'ybins.size', name: 'size'},
        {aStr: 'nbinsy', name: 'nbins'}
    ]
};

// handle bin attrs and relink auto-determined values so fullData is complete
module.exports = function crossTraceDefaults(fullData, fullLayout) {
    var allBinOpts = fullLayout._histogramBinOpts = {};
    var isOverlay = fullLayout.barmode === 'overlay';

    var histTraces = [];
    var mustMatchTracesLookup = {};
    var otherTracesList = [];
    var traces;

    var traceOut, binDir, binOpts, groupName;
    var i, j, k;

    function coerce(attr, dflt) {
        return Lib.coerce(traceOut._input, traceOut, attributes, attr, dflt);
    }

    function orientation2binDir() {
        return traceOut.orientation === 'v' ? 'x' : 'y';
    }

    function getAxisType() {
        var ax = axisIds.getFromTrace({_fullLayout: fullLayout}, traceOut, binDir);
        return ax.type;
    }

    for(i = 0; i < fullData.length; i++) {
        traceOut = fullData[i];

        if(traceIs(traceOut, 'histogram')) {
            histTraces.push(traceOut);

            // TODO: this shouldn't be relinked as it's only used within calc
            // https://github.com/plotly/plotly.js/issues/749
            delete traceOut._autoBinFinished;

            if(!traceIs(traceOut, '2dMap')) {
                handleGroupingDefaults(traceOut._input, traceOut, fullLayout, coerce);
            }
        }
    }

    // Look for traces that "have to match", that is:
    // - 1d histogram traces on the same subplot with same orientation under barmode:stack,
    // - 1d histogram traces on the same subplot with same orientation under barmode:group
    for(i = 0; i < histTraces.length; i++) {
        traceOut = histTraces[i];

        if(!isOverlay && !traceIs(traceOut, '2dMap')) {
            groupName = (
                axisIds.getAxisGroup(fullLayout, traceOut.xaxis) +
                axisIds.getAxisGroup(fullLayout, traceOut.yaxis) +
                orientation2binDir()
            );

            if(!mustMatchTracesLookup[groupName]) mustMatchTracesLookup[groupName] = [];
            mustMatchTracesLookup[groupName].push(traceOut);
        } else {
            otherTracesList.push(traceOut);
        }
    }

    // setup binOpts for traces that have to match,
    // if the traces have a valid bingroup, use that
    // if not use axis+binDir groupName
    for(groupName in mustMatchTracesLookup) {
        traces = mustMatchTracesLookup[groupName];

        // no need to 'force' anything when a single
        // trace is detected as "must match"
        if(traces.length === 1) {
            otherTracesList.push(traces[0]);
            continue;
        }

        var binGroupFound = false;
        for(i = 0; i < traces.length; i++) {
            traceOut = traces[i];
            binGroupFound = coerce('bingroup');
            break;
        }

        groupName = binGroupFound || groupName;

        for(i = 0; i < traces.length; i++) {
            traceOut = traces[i];
            var bingroupIn = traceOut._input.bingroup;
            if(bingroupIn && bingroupIn !== groupName) {
                Lib.warn([
                    'Trace', traceOut.index, 'must match',
                    'within bingroup', groupName + '.',
                    'Ignoring its bingroup:', bingroupIn, 'setting.'
                ].join(' '));
            }
            traceOut.bingroup = groupName;
        }

        binDir = orientation2binDir();
        allBinOpts[groupName] = {
            traces: traces,
            binDir: binDir,
            axType: getAxisType()
        };
    }

    // setup binOpts for traces that can but don't have to match,
    // notice that these traces can be matched with traces that have to match
    for(i = 0; i < otherTracesList.length; i++) {
        traceOut = otherTracesList[i];

        var binDirections = traceIs(traceOut, '2dMap') ?
            ['x', 'y'] :
            [orientation2binDir()];

        for(k = 0; k < binDirections.length; k++) {
            binDir = binDirections[k];
            groupName = coerce('bingroup');

            // N.B. group traces that don't have a bingroup with themselves
            // using trace uid and bin direction
            var fallbackGroupName = traceOut.uid + '__' + binDir;
            if(!groupName) groupName = fallbackGroupName;

            var axType = getAxisType();
            binOpts = allBinOpts[groupName];

            if(binOpts) {
                if(axType === binOpts.axType) {
                    binOpts.traces.push(traceOut);
                } else {
                    allBinOpts[fallbackGroupName] = {
                        traces: [traceOut],
                        binDir: binDir,
                        axType: axType
                    };
                    Lib.warn([
                        'Attempted to group the bins of trace', traceOut.index,
                        'set on a', 'type:' + axType, 'axis',
                        'with bins on', 'type:' + binOpts.axType, 'axis.'
                    ].join(' '));
                }
            } else {
                binOpts = allBinOpts[groupName] = {
                    traces: [traceOut],
                    binDir: binDir,
                    axType: axType
                };
            }
        }
    }

    for(groupName in allBinOpts) {
        binOpts = allBinOpts[groupName];
        binDir = binOpts.binDir;
        traces = binOpts.traces;

        // setup trace-to-binOpts reference used during calc
        for(i = 0; i < traces.length; i++) {
            traces[i]['_groupName' + binDir] = groupName;
        }

        var attrs = BINATTRS[binDir];
        var autoVals;

        for(j = 0; j < attrs.length; j++) {
            var attrSpec = attrs[j];
            var attr = attrSpec.name;

            // nbins(x|y) is moot if we have a size. This depends on
            // nbins coming after size in binAttrs.
            if(attr === 'nbins' && binOpts.sizeFound) continue;

            var aStr = attrSpec.aStr;
            for(i = 0; i < traces.length; i++) {
                traceOut = traces[i];
                if(nestedProperty(traceOut._input, aStr).get() !== undefined) {
                    binOpts[attr] = coerce(aStr);
                    binOpts[attr + 'Found'] = true;
                    break;
                }

                autoVals = (traceOut._autoBin || {})[binDir] || {};
                if(autoVals[attr]) {
                    // if this is the *first* autoval
                    nestedProperty(traceOut, aStr).set(autoVals[attr]);
                }
            }
            // start and end we need to coerce anyway, after having collected the
            // first of each into binOpts, in case a trace wants to restrict its
            // data to a certain range
            if(attr === 'start' || attr === 'end') {
                for(; i < traces.length; i++) {
                    traceOut = traces[i];
                    autoVals = (traceOut._autoBin || {})[binDir] || {};
                    coerce(aStr, autoVals[attr]);
                }
            }

            if(attr === 'nbins' && !binOpts.sizeFound && !binOpts.nbinsFound) {
                traceOut = traces[0];
                binOpts[attr] = coerce(aStr);
            }
        }
    }
};
