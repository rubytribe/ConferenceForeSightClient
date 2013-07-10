define(
    function () {
        var adapters = {
            initialize: initialize,
        };
        return adapters;
        
        function initialize(manager) {
            // Extend the manager's DataService with a custom JsonResultsAdapter 
            // based on the default JsonResultsAdapter
            var defaultAdapter = breeze.config.getAdapterInstance('dataService').jsonResultsAdapter;            
            var customAdapter = createCustomAdapter(defaultAdapter);         
            manager.dataService = manager.dataService.using({ 'jsonResultsAdapter': customAdapter });
        }
      
        // Extend the visitNode method of a source JsonResultsAdapter
        // to set Session.isPartial and Person.isPartial to false
        // when a query returns those entity types.
        function createCustomAdapter(sourceAdapter) {

            var baseVisitNode = sourceAdapter.visitNode;

            var visitNode = function (node, mappingContext, nodeContext) {
                if (/session|speaker/i.test(node.$type)) { // typename contains 'session' or 'speaker'
                    // this is a full session or speaker
                    node.isPartial = false; // camelCase, as unmapped property is defined on client
                }
                return baseVisitNode(node, mappingContext, nodeContext);
            };
            
            return new breeze.JsonResultsAdapter({
                name: 'ccjs',
                visitNode: visitNode              
            });         
        }
    });