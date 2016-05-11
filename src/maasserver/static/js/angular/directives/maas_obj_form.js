/* Copyright 2016 Canonical Ltd.  This software is licensed under the
 * GNU Affero General Public License version 3 (see the file LICENSE).
 *
 * MAAS object directive.
 *
 * Directive that connects a field to an object from the websocket. The field
 * is an instant save on blur.
 */

angular.module('MAAS').directive('maasObjForm', ['JSONService',
    function(JSONService) {
        function MAASFormController(scope) {
            this.obj = scope.obj;
            this.manager = scope.manager;
            this.fields = {};
            this.scope = scope;
            this.scope.saving = false;

            var self = this;
            scope.$watch("obj", function() {
                // Update the object when it changes.
                self.obj = scope.obj;
            });
        }

        // Called by maas-obj-field to register it as a editable field.
        MAASFormController.prototype.registerField = function(key, scope) {
            // Store the state of the field and its scope.
            this.fields[key] = {
                editing: false,
                scope: scope
            };

            // Watch for changes on the value of the object.
            var self = this;
            this.scope.$watch("obj." + key, function() {
                if(angular.isObject(self.obj) && !self.fields[key].editing) {
                    self.fields[key].scope.updateValue(self.obj[key]);
                }
            });

            // Return the current value for the field.
            if(angular.isObject(this.obj)) {
                return this.obj[key];
            } else {
                return null;
            }
        };

        // Called by maas-obj-field to place field in edit mode.
        MAASFormController.prototype.startEditingField = function(key) {
            this.fields[key].editing = true;
        };

        // Called by maas-obj-field to end edit mode for the field.
        MAASFormController.prototype.stopEditingField = function(key, value) {
            var field = this.fields[key];
            field.scope.clearErrors();

            // Copy the object and update the editing field.
            var updatedObj = angular.copy(this.obj);
            updatedObj[key] = value;
            if(updatedObj[key] === this.obj[key]) {
                // Nothing changed.
                field.editing = false;
                return;
            }

            // Update the item in the manager.
            this.scope.saving = true;
            this.updateItem(updatedObj, [key]);
        };

        // Update the item using the manager.
        MAASFormController.prototype.updateItem = function(updatedObj, keys) {
            var key = keys[0];
            var field = this.fields[key];
            var self = this;

            // Pre-process the updatedObj if one is defined.
            if(angular.isFunction(this.scope.preProcess)) {
                updatedObj = this.scope.preProcess(updatedObj, keys);
            }

            // Update the item with the manager.
            return this.manager.updateItem(updatedObj).then(function(newObj) {
                    // Update the value of the element.
                    field.editing = false;
                    field.scope.updateValue(newObj[key]);
                    self.scope.saving = false;
                    return newObj;
                }, function(error) {
                    var errorJson = JSONService.tryParse(error);
                    if(angular.isObject(errorJson)) {
                        // Add the error to each field it matches.
                        angular.forEach(errorJson, function(value, key) {
                            var errorField = self.fields[key];
                            if(!angular.isArray(value)) {
                                value = [value];
                            }

                            if(angular.isObject(errorField)) {
                                // Error on a field we know about, place the
                                // error on that field.
                                errorField.scope.setErrors(value);
                            } else {
                                // Error on a field we don't know about, place
                                // the error on the editing field. Prefixing
                                // the error with the field.
                                value = value.map(function(v) {
                                    return key + ": " + v;
                                });
                                field.scope.setErrors(value);
                            }
                        });
                    } else {
                        // Add the string error to just the field error.
                        field.scope.setErrors([error]);
                    }
                    self.scope.saving = false;
                    return error;
                });
        };

        return {
            restrict: "E",
            scope: {
                obj: "=",
                manager: "=",
                preProcess: "="
            },
            transclude: true,
            template: (
                '<form class="form" ng-class="{saving: saving}" ' +
                'ng-transclude></form>'),
            controller: ['$scope', MAASFormController]
        };
    }]);

angular.module('MAAS').directive('maasObjFieldGroup', ['JSONService',
    function(JSONService) {
        // Controller for this directive.
        function MAASGroupController(scope, timeout) {
            this.fields = {};
            this.scope = scope;
            this.timeout = timeout;

            var self = this;
            this.scope.isEditing = function() {
                var editing = false;
                angular.forEach(self.fields, function(value) {
                    if(!editing) {
                        editing = value.editing;
                    }
                });
                return editing;
            };
        }

        // Called by maas-obj-field to register it as a editable field.
        MAASGroupController.prototype.registerField = function(key, scope) {
            // Store the state of the field and its scope.
            this.fields[key] = {
                editing: false,
                scope: scope
            };
            return this.formController.registerField(key, scope);
        };

        // Called by maas-obj-field to place field in edit mode.
        MAASGroupController.prototype.startEditingField = function(key) {
            this.fields[key].editing = true;
            delete this.fields.lastValue;

            // Set all fields in the group as editing in the formController.
            var self = this;
            angular.forEach(this.fields, function(value, key) {
                self.formController.startEditingField(key);
            });
        };

        // Called by maas-obj-field to exit edit mode for the field.
        MAASGroupController.prototype.stopEditingField = function(key, value) {
            var field = this.fields[key];
            field.editing = false;
            field.lastValue = value;

            // Delay the handling of stop to make sure start is not called on
            // the next field in the group.
            var self = this;
            this.timeout(function() {
                // If any other fields are in edit mode then nothing to do.
                var editing = false;
                angular.forEach(self.fields, function(value) {
                    if(!editing) {
                        editing = value.editing;
                    }
                });
                if(editing) {
                    return;
                }

                // Copy the object and update the editing fields.
                var keys = [];
                var changed = false;
                var updatedObj = angular.copy(self.formController.obj);
                angular.forEach(self.fields, function(value, key) {
                    value.scope.clearErrors();
                    if(!angular.isUndefined(value.lastValue) &&
                        updatedObj[key] !== value.lastValue) {
                        keys.push(key);
                        updatedObj[key] = value.lastValue;
                        changed = true;
                    }
                });
                if(!changed) {
                    return;
                }

                // Place the field that actually triggered the update first.
                var keyIdx = keys.indexOf(key);
                if(keyIdx !== -1) {
                    keys.splice(keyIdx, 1);
                    keys.splice(0, 0, key);
                }

                // Update the object.
                self.formController.updateItem(updatedObj, keys);
            }, 10); // Really short has to be next click.
        };

        return {
            restrict: "E",
            require: ["^^maasObjForm", "maasObjFieldGroup"],
            scope: {},
            transclude: true,
            template: (
                '<div class="form__siblings" ' +
                'ng-class="{\'form__siblings--active\': isEditing()}" ' +
                'ng-transclude></div>'),
            controller: ['$scope', '$timeout', MAASGroupController],
            link: {
                pre: function(scope, element, attrs, controllers) {
                    // Set formController on the MAASGroupController to
                    // point to its parent MAASFormController. This is done in
                    // pre-link so the controller has the formController before
                    // registerField is called.
                    controllers[1].formController = controllers[0];
                }
            }
        };
    }]);

angular.module('MAAS').directive('maasObjField', ['$compile',
    function($compile) {
        return {
            restrict: "E",
            require: ["^^maasObjForm", "?^^maasObjFieldGroup"],
            scope: {},
            transclude: true,
            template: (
                '<div class="form__group form__group--inline ' +
                'form__group--subtle" ng-transclude></div>'),
            link: function(scope, element, attrs, controllers) {
                // Select the controller based on which is available.
                var controller = controllers[1];
                if(!angular.isObject(controller)) {
                    controller = controllers[0];
                }

                // type and key required.
                var missingAttrs = [];
                if(!angular.isString(attrs.type) && attrs.type.length === 0) {
                    missingAttrs.push("type");
                }
                if(!angular.isString(attrs.key) && attrs.key.length === 0) {
                    missingAttrs.push("key");
                }
                if(missingAttrs.length > 0) {
                    throw new Error(
                        missingAttrs.join(", ") +
                        " are required on maas-obj-field.");
                }

                // Set element to the transcluded div.
                element = element.find("div");

                // Render the label.
                var label = attrs.label || attrs.key;
                var labelElement = angular.element(
                    '<label for="' + attrs.key + '">' + label + '</label>');
                if(attrs.labelWidth) {
                    labelElement.addClass(attrs.labelWidth + "-col");
                }
                element.append(labelElement);

                // Add the wrapper for the input.
                var inputWrapper = angular.element(
                    '<div class="form__group-input"></div>');
                if(attrs.inputWidth) {
                    inputWrapper.addClass(attrs.inputWidth + "-col");
                    inputWrapper.addClass("last-col");
                }

                // Render the input based on the type.
                var placeholder = attrs.placeholder || scope.label;
                var inputElement = null;
                if(attrs.type === "text" || attrs.type === "textarea") {
                    if(attrs.type === "text") {
                        inputElement = angular.element(
                            '<input type="text" id="' + attrs.key +
                            '" placeholder="' + placeholder + '">');
                    } else if(attrs.type === "textarea") {
                        inputElement = angular.element(
                            '<textarea id="' + attrs.key +
                            '" placeholder="' + placeholder + '"></textarea>');
                    }

                    // Allow enter on blur, by default.
                    if(attrs.blurOnEnter !== "false") {
                        inputElement.bind("keydown keypress", function(evt) {
                            if(evt.which === 13) {
                                inputElement.blur();
                                evt.preventDefault();
                            }
                        });
                    }

                    // Revert value on esc.
                    var self = this;
                    inputElement.bind("keydown keypress", function(evt) {
                        if(evt.which === 27) {
                            inputElement.val(controller.scope.obj[attrs.key]);
                            inputElement.blur();
                            evt.preventDefault();
                        }
                    });

                    // Register the field with the controller and set the
                    // current value for the field.
                    var currentValue = controller.registerField(
                        attrs.key, scope);
                    inputElement.val(currentValue);

                    // When element is in focus then editing is on.
                    inputElement.on("focus", function() {
                        scope.$apply(function() {
                            controller.startEditingField(attrs.key);
                        });
                    });

                    // When element is not in focus then editing is done.
                    inputElement.on("blur", function() {
                        scope.$apply(function() {
                            controller.stopEditingField(
                                attrs.key, inputElement.val());
                        });
                    });

                    // Called by controller to update the value.
                    scope.updateValue = function(newValue) {
                        inputElement.val(newValue);
                    };
                } else if(attrs.type === "options") {
                    // Requires the options attribute on the element. This
                    // is copied directly into the ngOptions directive on
                    // the select.
                    var options = attrs.options;
                    if(!angular.isString(options) || options.length === 0) {
                        throw new Error(
                            "options attribute is required on type " +
                            "'options' on maas-obj-field.");
                    }

                    // Create a child scope of the parent scope for this
                    // directive. Since this directive is created with an
                    // isolated scope we need the child to use the parent so
                    // ngOptions can use properties defined in that scope.
                    var childScope = scope.$parent.$new();
                    childScope._selectValue = controller.registerField(
                        attrs.key, scope);
                    childScope._selectNgChange = function(key) {
                        controller.stopEditingField(
                            key, childScope._selectValue);
                    };

                    // Construct the select.
                    inputElement = $compile(
                        '<select id="' + attrs.key + '" ' +
                        'ng-model="_selectValue" ' +
                        'ng-options="' + options + '"' +
                        'ng-change="_selectNgChange(\'' + attrs.key + '\')">' +
                        '<option value="" disabled>' + placeholder +
                        '</option></select>')(childScope);

                    // Called by controller to update the value.
                    scope.updateValue = function(newValue) {
                        childScope._selectValue = newValue;
                    };
                } else {
                    throw new Error(
                        "Unknown type on maas-obj-field: " + attrs.type);
                }
                inputWrapper.append(inputElement);

                // Errors element.
                var errorsElement = angular.element(
                    '<ul class="form__group-errors errors"></ul>');
                inputWrapper.append(errorsElement);
                element.append(inputWrapper);

                // Called by controller to clear all errors.
                scope.clearErrors = function() {
                    inputElement.removeClass("invalid");
                    errorsElement.empty();
                };

                // Called by controller to set errors.
                scope.setErrors = function(errors) {
                    if(errors.length > 0) {
                        inputElement.addClass("invalid");
                        angular.forEach(errors, function(error) {
                            errorsElement.append("<li>" + error + "</li>");
                        });
                        // Set the input in focus but outside of the current
                        // digest cycle.
                        setTimeout(function() {
                            inputElement.focus();
                        }, 1);
                    }
                };
            }
        };
    }]);