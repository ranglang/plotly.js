/**
* Copyright 2012-2017, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var Lib = require('../../lib');
var Color = require('../../components/color');
var Plots = require('../plots');
var Registry = require('../../registry');
var handleSubplotDefaults = require('../subplot_defaults');

var handleTickValueDefaults = require('../cartesian/tick_value_defaults');
var handleTickMarkDefaults = require('../cartesian/tick_mark_defaults');
var handleTickLabelDefaults = require('../cartesian/tick_label_defaults');
var handleCategoryOrderDefaults = require('../cartesian/category_order_defaults');
var handleLineGridDefaults = require('../cartesian/line_grid_defaults');
var autoType = require('../cartesian/axis_autotype');
var orderedCategories = require('../cartesian/ordered_categories');
var setConvert = require('../cartesian/set_convert');

var setConvertAngular = require('./helpers').setConvertAngular;
var layoutAttributes = require('./layout_attributes');
var constants = require('./constants');
var axisNames = constants.axisNames;

function handleDefaults(contIn, contOut, coerce, opts) {
    var bgColor = coerce('bgcolor');
    opts.bgColor = Color.combine(bgColor, opts.paper_bgcolor);

    var sector = coerce('sector');

    // could optimize, subplotData is not always needed!
    var subplotData = Plots.getSubplotData(opts.fullData, constants.name, opts.id);
    var layoutOut = opts.layoutOut;
    var axName;

    function coerceAxis(attr, dflt) {
        return coerce(axName + '.' + attr, dflt);
    }

    for(var i = 0; i < axisNames.length; i++) {
        axName = axisNames[i];

        if(!Lib.isPlainObject(contIn[axName])) {
            contIn[axName] = {};
        }

        var axIn = contIn[axName];
        var axOut = contOut[axName] = {};
        axOut._id = axOut._name = axName;

        var dataAttr = constants.axisName2dataArray[axName];
        var axType = handleAxisTypeDefaults(axIn, axOut, coerceAxis, subplotData, dataAttr);

        handleCategoryOrderDefaults(axIn, axOut, coerceAxis);
        axOut._initialCategories = axType === 'category' ?
            orderedCategories(dataAttr, axOut.categoryorder, axOut.categoryarray, subplotData) :
            [];

        if(axType === 'date') {
            var handleCalendarDefaults = Registry.getComponentMethod('calendars', 'handleDefaults');
            handleCalendarDefaults(axIn, axOut, 'calendar', layoutOut.calendar);
        }

        var visible = coerceAxis('visible');
        setConvert(axOut, layoutOut);

        var dfltColor;
        var dfltFontColor;

        if(visible) {
            dfltColor = coerceAxis('color');
            dfltFontColor = (dfltColor === axIn.color) ? dfltColor : opts.font.color;
        }

        // We don't want to make downstream code call ax.setScale,
        // as both radial and angular axes don't have a set domain.
        // Furthermore, angular axes don't have a set range.
        //
        // Mocked domains and ranges are set by the polar subplot instances,
        // but Axes.expand uses the sign of _m to determine which padding value
        // to use.
        //
        // By setting, _m to 1 here, we make Axes.expand think that range[1] > range[0],
        // and vice-versa for `autorange: 'reversed'` below.
        axOut._m = 1;

        switch(axName) {
            case 'radialaxis':
                var autoRange = coerceAxis('autorange', !axOut.isValidRange(axIn.range));
                if(autoRange) coerceAxis('rangemode');
                if(autoRange === 'reversed') axOut._m = -1;

                coerceAxis('range');
                axOut.cleanRange('range', {dfltRange: [0, 1]});

                if(visible) {
                    coerceAxis('side');
                    coerceAxis('angle', sector[0]);

                    coerceAxis('title');
                    Lib.coerceFont(coerceAxis, 'titlefont', {
                        family: opts.font.family,
                        size: Math.round(opts.font.size * 1.2),
                        color: dfltFontColor
                    });
                }
                break;

            case 'angularaxis':
                if(axType === 'linear') {
                    coerceAxis('thetaunit');
                } else {
                    coerceAxis('period');
                }

                // TODO maybe by default: non-linear axis
                // should get direction: 'clockwise' + rotation: 90
                coerceAxis('direction');
                coerceAxis('rotation');

                setConvertAngular(axOut);
                break;
        }

        if(visible) {
            handleTickValueDefaults(axIn, axOut, coerceAxis, axOut.type);
            handleTickLabelDefaults(axIn, axOut, coerceAxis, axOut.type, {
                noHover: false,
                tickSuffixDflt: axOut.thetaunit === 'degrees' ? '°' : undefined
            });
            handleTickMarkDefaults(axIn, axOut, coerceAxis, {outerTicks: true});

            var showTickLabels = coerceAxis('showticklabels');
            if(showTickLabels) {
                Lib.coerceFont(coerceAxis, 'tickfont', {
                    family: opts.font.family,
                    size: opts.font.size,
                    color: dfltFontColor
                });
                coerceAxis('tickangle');
                coerceAxis('tickformat');
            }

            handleLineGridDefaults(axIn, axOut, coerceAxis, {
                dfltColor: dfltColor,
                bgColor: opts.bgColor,
                // default grid color is darker here (60%, vs cartesian default ~91%)
                // because the grid is not square so the eye needs heavier cues to follow
                blend: 60,
                showLine: true,
                showGrid: true,
                noZeroLine: true,
                attributes: layoutAttributes[axName]
            });

            coerceAxis('layer');
        }

        coerceAxis('hoverformat');

        axOut._input = axIn;
    }
}

function handleAxisTypeDefaults(axIn, axOut, coerce, subplotData, dataAttr) {
    var axType = coerce('type');

    if(axType === '-') {
        var trace;

        for(var i = 0; i < subplotData.length; i++) {
            if(subplotData[i].visible) {
                trace = subplotData[i];
                break;
            }
        }

        // TODO add trace input calendar support
        if(trace) {
            axOut.type = autoType(trace[dataAttr], 'gregorian');
        }

        if(axOut.type === '-') {
            axOut.type = 'linear';
        } else {
            // copy autoType back to input axis
            // note that if this object didn't exist
            // in the input layout, we have to put it in
            // this happens in the main supplyDefaults function
            axIn.type = axOut.type;
        }
    }

    return axOut.type;
}

module.exports = function supplyLayoutDefaults(layoutIn, layoutOut, fullData) {
    handleSubplotDefaults(layoutIn, layoutOut, fullData, {
        type: constants.name,
        attributes: layoutAttributes,
        handleDefaults: handleDefaults,
        font: layoutOut.font,
        paper_bgcolor: layoutOut.paper_bgcolor,
        fullData: fullData,
        layoutOut: layoutOut
    });
};
