var async = require('async'),
    base = require("../../client/base"),
    error = require("../../client/error");

// TODO(roland): Make methods throw NotImplemented where applicable.

var QuotaManager = base.Manager.extend({
  namespace: "os-quota-sets",
  singular: 'quota_set',
  plural: 'quota_sets',

  // This list does not include volume quotas which are handled by Cinder.
  _quota_names: ["instances", "cores", "ram", "floating_ips", "key_pairs",
                 "security_groups", "security_group_rules", "metadata_items",
                 "injected_files", "injected_file_content_bytes",
                 "injected_file_path_bytes"],

  get: function (params, callback) {
    params.parseResult = function (result) {
      // Set flavor attributes which aren't quota'd to -1 for "unlimited".
      result.disk = -1;
      result["OS-FLV-EXT-DATA:ephemeral"] = -1;
      return result;
    };
    this._super(params, callback);
  },

  update: function (params, callback) {
    params.id = params.id || params.data.id;

    // Treat blank values as "unlimited" and set them to -1.
    this._quota_names.forEach(function (name) {
      var val = params.data[name];
      if (typeof val !== "undefined" && val !== 0 && !val) params.data[name] = -1;
    });

    params.parseResult = function (result) {
      result.id = params.id;
      return result;
    };

    this._super(params, callback);
  },

  usages: function (params, callback) {
    var manager = this,
        usages = {},
        flavors = {},
        instances = [];

    usages.id = this.client.tenant.id;
    usages.cores = 0;
    usages.vcpus = 0;
    usages.ram = 0;
    usages.instances = 0;
    usages["OS-FLV-EXT-DATA:ephemeral"] = 0;

    async.series([
      function (next) {
        manager.client.servers.all({
          detail: true,
          success: function (results) {
            instances = results;
            next(null);
          },
          error: next
        });
      },
      function (next) {
        manager.client.flavors.in_use({
          instances: instances,
          detail: true,
          success: function (results) {
            results.forEach(function (flavor) {
              flavors[flavor.id] = flavor;
            });
            next(null);
          },
          error: next
        });
      }
    ], function (err) {
      if (err) {
        if (callback) callback(err);
        if (params.error) params.error(err);
        return;
      }

      usages.instances = instances.length;

      instances.forEach(function (instance) {
        var flavor = flavors[instance.flavor.id];

        usages.vcpus += flavor.vcpus;
        usages.cores += flavor.vcpus;
        usages.ram += flavor.ram;
        usages.root_gb += flavor.disk;
        usages["OS-FLV-EXT-DATA:ephemeral"] += flavor["OS-FLV-EXT-DATA:ephemeral"];
      });

      if (callback) callback(null, usages);
      if (params.success) params.success(usages);
    });
  }
});


module.exports = QuotaManager;
