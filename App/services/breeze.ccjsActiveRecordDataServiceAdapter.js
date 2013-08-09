//#region Copyright, Version, and Description
/*
 * Copyright 2013 IdeaBlade, Inc.  All Rights Reserved.
 * Use, reproduction, distribution, and modification of this code is subject to the terms and
 * conditions of the IdeaBlade Breeze license, available at http://www.breezejs.com/license
 *
 * Author: Ward Bell
 * Version: 0.1
 * --------------------------------------------------------------------------------
 * Breeze "data service adapter" for talking to an ActiveRecord data service
 * Experimental! This is a primitive implementation, not currently "supported".
 * Use it for guidance and roll your own.
 *
 * Usage:
 *    During application bootsrapping, configure your application to use this service, e.g.
 *      breeze.config.initializeAdapterInstance("dataService", "ccjs_active_record", true);
 *
 *    Future EntityManager.saveChanges() will use this data service adapter
 *
 * Limitations:
 *    Only saves one entity at a time; will throw otherwise
 */
//#endregion
(function(factory) {
    if (breeze) {
        factory(breeze);
    } else if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
        // CommonJS or Node: hard-coded dependency on "breeze"
        factory(require("breeze"));
    } else if (typeof define === "function" && define["amd"] && !breeze) {
        // AMD anonymous module with hard-coded dependency on "breeze"
        define(["breeze"], factory);
    }
}(function(breeze) {
    'use strict'

    var ctor = function() {
        this.name = 'ccjs_active_record';
        this.configuration = {};
    };

    breeze.config.registerAdapter("dataService", ctor);

    ctor.prototype = new breeze.AbstractDataServiceAdapter();

    ctor.prototype.saveChanges = function(saveContext, saveBundle) {

        var ajaxImpl, requestInfo;
        var deferred = Q.defer();
        var that = this;

        try{
            ajaxImpl = this._getAjax();
            requestInfo = this._getRequestInfo(saveContext, saveBundle);
        } catch (err) {
            deferred.reject(err);
            return deferred.promise;
        }

        // Right now can only make a single save request
        // for a single entity
        var request = {
            method: requestInfo.method,
            url: requestInfo.url,
            data: requestInfo.data,
            dataType: 'json',
            accept:  {json:'application/json'},
            contentType: 'application/json; charset=utf-8',
            success: saveSuccess,
            error: saveFail
        }

        ajaxImpl.ajax(request);

        return deferred.promise;

        function saveSuccess(data, textStatus, XHR) {
            var saveResult = that._prepareSaveResult(saveContext, data, XHR);
            deferred.resolve(saveResult);
        }

        function saveFail(XHR, textStatus, errorThrown) {
            that._handleXHRError(deferred, XHR);
        }
    };

    ctor.prototype._getAjax = function() {
        var ajaxImpl = breeze.config.getAdapterInstance("ajax");
        if (ajaxImpl && ajaxImpl.ajax ) {
            return ajaxImpl;
        }
        throw new Error("Unable to acquire an 'ajax' adapter for "+ this.name);
    }

    ctor.prototype._getRequestInfo = function(saveContext, saveBundle){

        var em = saveContext.entityManager;
        var helper = em.helper;
        var metadataStore = em.metadataStore;

        if (saveBundle.entities.length > 1) {
            throw new Error("Can only save one entity at a time; multi-entity save is not yet implemented.")
        }

        var entity = saveBundle.entities[0]
        var aspect = entity.entityAspect;
        var entityTypeShortName =  entity.entityType.shortName
        var url = saveContext.dataService.makeUrl(this.pluralize(entityTypeShortName));
        var key =  aspect.getKey();
        saveContext.saveKey = key;
        var id =  key.values.join(',');
        var data = {};
        var dataKey = entityTypeShortName.toLowerCase();
        var entityStateName =  aspect.entityState.name;

        switch (entityStateName){
            case 'Added':
                var raw =  helper.unwrapInstance(entity, true, true);
                delete raw.id; // hack until we augment unwrapInstance in Breeze
                data[dataKey] = raw;
                return {
                    method: 'POST',
                    url: url,
                    data: JSON.stringify(data)
                }
            case 'Modified':
                data[dataKey] = helper.unwrapChangedValues(entity, metadataStore, true);
                return {
                    method: 'PUT',
                    url: url+'/'+id,
                    data: JSON.stringify(data)
                }

            case 'Deleted':
                return {
                    method: 'DELETE',
                    url: url+'/'+id
                }
            default:
                throw new Error('Cannot save an entity with state = '+entityStateName);
        }
    }

    ctor.prototype._prepareSaveResult = function (saveContext, data, XHR) {

        var em = saveContext.entityManager;
        var helper = em.helper;
        var entities = [];
        var keyMappings = [];

        // Only saving one entity so facts about it are readily available
        // and exactly parallel the data returned by server (if any)
        var saveKey = saveContext.saveKey;
        var entityType = saveKey.entityType;

        if (data){ // was an add
            var rawEntity = data[entityType.shortName.toLowerCase()]; // should be the saved entity
            if (!rawEntity.$type) {rawEntity.$type = entityType.name}
            entities.push(rawEntity);
            var realKey = helper.getEntityKeyFromRawEntity(rawEntity, entityType, false);
            var keyMapping = { entityTypeName: entityType.name, tempValue: saveKey.values[0], realValue: realKey.values[0] };
            keyMappings.push(keyMapping);
        } else { // was modify or delete
            var entity = em.getEntityByKey(saveKey);
            if (entity) {  // should still be in cache but you never know.
                entities.push(entity);
            }
        }

        return { entities: entities, keyMappings: keyMappings, XHR: XHR };
    };

    ctor.prototype.jsonResultsAdapter = new breeze.JsonResultsAdapter({
        name: "ccjs_active_record_default",

        visitNode: function (node, mappingContext, nodeContext) {
            if (node == null) return {};
            var result = {};
            if (node.$type) {
                result.entityType = mappingContext.entityManager.metadataStore._getEntityType(node.$type, true);
            }
            return result;
        }
    });

    // Todo: belongs elsewhere
    ctor.prototype.pluralize = function (name) {
        var plurals = this.configuration.plurals;   // special-case pluralization
        return (plurals && plurals[name]) || name + "s";
    };

}));
