const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const marker = '# HireQuick: use Smile ID binaries with host-owned Sentry';
const upstream = 'https://github.com/smileidentity/ios-spm';

// Smile's plugin also attaches packages to Pods.xcodeproj during pod install.
// Run after its hooks, retaining product dependencies and changing only the
// package reference. Random UUIDs avoid React Native's post-install UUID pool.
const podHook = `
    ${marker}
    require 'securerandom'
    local_path = File.expand_path('../native/smileid', __dir__)
    raise 'HireQuick Smile ID package missing' unless File.file?(File.join(local_path, 'Package.swift'))
    projects = [installer.pods_project] + installer.aggregate_targets.map(&:user_project).compact
    projects.uniq.each do |project|
      refs = project.root_object.package_references.select do |ref|
        ref.respond_to?(:repositoryURL) && ref.repositoryURL.to_s.sub(/\\.git$/, '').chomp('/') == '${upstream}'
      end
      next if refs.empty?
      local_ref = project.root_object.package_references.find do |ref|
        ref.is_a?(Xcodeproj::Project::Object::XCLocalSwiftPackageReference) && ref.relative_path == local_path
      end
      unless local_ref
        uuid = SecureRandom.hex(12).upcase
        uuid = SecureRandom.hex(12).upcase while project.objects_by_uuid.key?(uuid)
        local_ref = Xcodeproj::Project::Object::XCLocalSwiftPackageReference.new(project, uuid)
        local_ref.initialize_defaults
        local_ref.relative_path = local_path
        project.root_object.package_references << local_ref
      end
      project.objects.grep(Xcodeproj::Project::Object::XCSwiftPackageProductDependency).each do |dep|
        dep.package = local_ref if refs.include?(dep.package)
      end
      refs.each(&:remove_from_project)
      project.save
    end
`;

module.exports = function withSmileIdHostSentry(config) {
  return withDangerousMod(config, ['ios', (mod) => {
    const file = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes(marker)) return mod;
    const close = '\n  end\nend';
    const index = source.lastIndexOf(close);
    if (index < 0 || !source.includes('post_install do |installer|')) {
      throw new Error('HireQuick: unsupported Podfile post_install structure');
    }
    fs.writeFileSync(file, source.slice(0, index) + podHook + source.slice(index));
    return mod;
  }]);
};
