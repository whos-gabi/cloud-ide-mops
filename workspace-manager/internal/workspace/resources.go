//creare de resurse folosind clientul

package workspace

import (
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
)

// CREATEWORKSPACEREQUEST
// USERID SI WORKSPACEID. GESTIOMATE DE BACKEND TYPESCRIPT
func BuildDeployment(req CreateWorkspaceRequest) *appsv1.Deployment {
	replicas := int32(1)

	labels := map[string]string{
		"workspace-id": req.WorkspaceID,
		"user-id":      req.UserID,
	}

	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:   req.WorkspaceID,
			Labels: labels,
		},

		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,

			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"workspace-id": req.WorkspaceID,
				},
			},

			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
				},

				Spec: corev1.PodSpec{
					SecurityContext: &corev1.PodSecurityContext{
						FSGroup:             int64Ptr(1000),
						FSGroupChangePolicy: fsGroupChangePolicyPtr(corev1.FSGroupChangeOnRootMismatch),
					},

					Volumes: []corev1.Volume{
						{
							Name: "workspace",
							VolumeSource: corev1.VolumeSource{
								PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
									ClaimName: req.WorkspaceID + "-pvc",
								},
							},
						},
					},

					Containers: []corev1.Container{
						{
							Name:            "workspace-runtime",
							Image:           workspaceRuntimeImage(),
							ImagePullPolicy: corev1.PullNever,

							SecurityContext: &corev1.SecurityContext{
								RunAsUser:    int64Ptr(1000),
								RunAsGroup:   int64Ptr(1000),
								RunAsNonRoot: boolPtr(true),
							},

							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "workspace",
									MountPath: "/workspace",
								},
							},
						},

						{
							Name:            "file-agent",
							Image:           fileAgentImage(),
							ImagePullPolicy: corev1.PullNever,

							SecurityContext: &corev1.SecurityContext{
								RunAsUser:    int64Ptr(1000),
								RunAsGroup:   int64Ptr(1000),
								RunAsNonRoot: boolPtr(true),
							},

							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "workspace",
									MountPath: "/workspace",
								},
							},
						},
					},
				},
			},
		},
	}
}

func int64Ptr(v int64) *int64 {
	return &v
}

func boolPtr(v bool) *bool {
	return &v
}

func fsGroupChangePolicyPtr(v corev1.PodFSGroupChangePolicy) *corev1.PodFSGroupChangePolicy {
	return &v
}

func BuildPVC(req CreateWorkspaceRequest) *corev1.PersistentVolumeClaim {
	return &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name: req.WorkspaceID + "-pvc",
			Labels: map[string]string{
				"workspace-id": req.WorkspaceID,
				"user-id":      req.UserID,
			},
		},

		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{
				corev1.ReadWriteOnce,
			},

			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("15Gi"),
				},
			},
		},
	}
}

func BuildService(req CreateWorkspaceRequest) *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name: req.WorkspaceID,
			Labels: map[string]string{
				"workspace-id": req.WorkspaceID,
				"user-id":      req.UserID,
			},
		},

		Spec: corev1.ServiceSpec{
			Type: corev1.ServiceTypeClusterIP,

			Selector: map[string]string{
				"workspace-id": req.WorkspaceID,
			},

			Ports: []corev1.ServicePort{
				{
					Name:       "file-agent",
					Port:       8081,
					TargetPort: intstr.FromInt32(8081),
					Protocol:   corev1.ProtocolTCP,
				},
			},
		},
	}
}
